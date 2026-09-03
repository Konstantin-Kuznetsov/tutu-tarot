import type { NextConfig } from "next";

// Where this deployment actually lives, as an absolute origin. On Vercel this
// never had to be said out loud: Next falls back to VERCEL_PROJECT_PRODUCTION_URL
// when `metadataBase` is unset (see next/dist/lib/metadata/resolvers/resolve-url.js,
// getSocialImageMetadataBaseFallback). Self-hosted there is no such variable, and
// the next link in that same fallback chain is `http://localhost:PORT` -- which
// would be baked into every og:image meta tag we serve, so a shared reading would
// unfurl to nothing in every messenger while looking perfectly fine to us.
//
// Falling back to localhost here rather than throwing is deliberate: `next build`
// runs in CI and in Docker where the public origin is genuinely unknown, and a
// build must not fail over metadata. The value is read at build time, so it has
// to be present in the build environment, not just at runtime.
const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? `http://localhost:${process.env.PORT ?? 3000}`;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,

  // Ship a self-contained server: `.next/standalone` carries only the traced
  // files it actually needs, so the runtime image needs no `npm install` and
  // no node_modules of its own. `public` and `.next/static` are NOT included
  // by design -- the Dockerfile copies them in explicitly.
  output: "standalone",

  env: {
    NEXT_PUBLIC_SITE_ORIGIN: siteOrigin,
  },

  async headers() {
    return [
      {
        // The reading page streams: the cards flush immediately and the road
        // arrives when Tutu answers, up to 18s later (SEARCH_BUDGET_MS). nginx
        // buffers proxied responses by default, which would hold the whole
        // document until the search finished -- the two-phase ritual would
        // silently become one long blank wait, which is exactly the experience
        // the design exists to avoid. This header is nginx's own opt-out.
        // Harmless everywhere else, so it is not conditioned on the host.
        source: "/:path*",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
    ];
  },
};

export default nextConfig;
