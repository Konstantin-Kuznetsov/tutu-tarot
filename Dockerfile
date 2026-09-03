# syntax=docker/dockerfile:1

# Three stages so the shipped image carries neither the toolchain nor the
# dev dependencies: deps installs, builder compiles, runner holds only the
# traced output. The result runs `node server.js` with no npm install at
# boot -- that is what `output: "standalone"` in next.config.ts buys.

# Node 24 is the current LTS. Pinned to a minor rather than `24` so a
# rebuild months from now produces the same runtime, and alpine because
# nothing here needs glibc: the only native-ish work is Satori, which ships
# as WASM inside Next.
FROM node:24.11-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` rather than `install`: reproducible, and it fails loudly if the
# lockfile and package.json have drifted apart instead of quietly resolving
# something new into a production image.
RUN npm ci

FROM node:24.11-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Read at BUILD time, not at run time: Next inlines NEXT_PUBLIC_* into the
# bundle and resolves metadataBase during the build, so passing this only to
# `docker run` would be too late and every og:image would point at localhost.
# Pass it with --build-arg NEXT_PUBLIC_SITE_ORIGIN=https://…
ARG NEXT_PUBLIC_SITE_ORIGIN
ENV NEXT_PUBLIC_SITE_ORIGIN=$NEXT_PUBLIC_SITE_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:24.11-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Never root: a process that renders untrusted input (the share code comes
# from whatever URL a stranger opens) has no business owning the filesystem.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `standalone` deliberately omits these two -- see the output.md note in the
# Next docs. Copying them in is what lets server.js serve the card art and
# the hashed JS/CSS without a separate CDN in front.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
# 0.0.0.0, not localhost: the default binding would only accept connections
# from inside the container, so nginx on the host would get connection refused.
ENV HOSTNAME=0.0.0.0

# Hits the app's own liveness route (src/app/healthz/route.ts), which answers
# without calling Tutu or the AI gateway on purpose.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form so node is PID 1 and receives SIGTERM directly. Next drains
# in-flight requests on that signal -- which matters here more than usual,
# because a request in flight can be an 18-second Tutu search someone is
# waiting on.
CMD ["node", "server.js"]
