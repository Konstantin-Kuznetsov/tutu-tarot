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
  //
  // Off on Vercel, and that is not a preference -- it is the difference
  // between a build and a failed one. Both this mode and Vercel's own build
  // adapter consume the same output: the `@vercel/nft` traces Next writes to
  // `.next/*.nft.json`. Standalone eats them to assemble `.next/standalone/`,
  // and Vercel's `onBuildComplete` then cannot find what it needs to build
  // its functions, failing with `ENOENT ... .next/next-server.js.nft.json`.
  // It reproduces nowhere else: a local build emits those files either way,
  // so this only ever appears on Vercel.
  //
  // Kept conditional rather than removed because this branch has to build in
  // both places until the move actually happens -- production is still on
  // Vercel while the server is being provisioned.
  output: process.env.VERCEL ? undefined : "standalone",

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
        //
        // Scoped to this one route rather than "/:path*", and that is not
        // tidiness: a proxy cannot cache a response it is not buffering, so
        // sending this everywhere silently disabled nginx's cache for the
        // share images too -- caught by watching X-Cache-Status stay MISS on
        // a third identical request. The images are the one thing that most
        // needs caching, and the one thing that never streams.
        source: "/r/:code",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
    ];
  },
};

export default nextConfig;
