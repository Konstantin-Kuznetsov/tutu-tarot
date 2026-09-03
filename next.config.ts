import type { NextConfig } from "next";

// Where this deployment actually lives, as an absolute origin -- and ONLY when
// somebody has actually said. Left unset otherwise, on purpose.
//
// The temptation is to default it to localhost so the value is never missing.
// That is exactly wrong, and it broke production once: Next has its own
// fallback chain for `metadataBase` (VERCEL_PROJECT_PRODUCTION_URL, then
// localhost -- see next/dist/lib/metadata/resolvers/resolve-url.js), and that
// chain only runs while `metadataBase` is unset. Supplying a localhost default
// overrode Vercel's own correct answer with a wrong one, and every og:image on
// Vercel became `http://localhost:3000/...` -- the precise failure this
// variable exists to prevent off Vercel, reintroduced on it. The build stays
// green either way, so nothing catches it but looking at the meta tag.
//
// So: set it and it wins (self-hosting, where nothing else knows the origin);
// leave it and Next decides (Vercel, where the platform knows better than we
// do).
//
// Forgetting it while self-hosting is not silent, but it is quiet: Next warns
// only when it first resolves the metadata, which for a dynamic route is on
// the first request -- so it appears in the server log, never in the build.
// A green CI proves nothing here. docs/deploy.md leads with this for that
// reason.
const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;

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

  // Only injected when set -- an inlined empty string would read as "present"
  // in the layout and defeat the whole point above.
  ...(siteOrigin ? { env: { NEXT_PUBLIC_SITE_ORIGIN: siteOrigin } } : {}),

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
