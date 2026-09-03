// Liveness probe for whatever runs this in production -- Docker's HEALTHCHECK,
// a systemd watchdog, nginx upstream checks, Kubernetes. Deliberately does NOT
// touch Tutu MCP or the AI gateway: a probe that fails when a third party is
// down would take a working process out of the load balancer for something it
// cannot fix, and the app is explicitly built to keep serving without either
// (see roadUnavailable.ts for the search, narrator.ts for the AI).
//
// This answers exactly one question: is this Node process still able to run
// route code and reply?
import { hostname } from "node:os";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      uptime: Math.round(process.uptime()),
      // Which replica answered. Inside a container this is the container id,
      // so an operator reading a health check -- or watching traffic spread
      // across replicas -- can tell one process from another without shelling
      // into anything. Not a secret: it is an ephemeral id, not a hostname
      // anyone can route to.
      instance: hostname(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
