import type { LegOutcome } from "@/domain/types";

// One line per completed ritual, and one per failed one.
//
// nginx already answers "how many people came" and "what status did they get".
// What it cannot see is why: a reading where Tutu found nothing is a perfectly
// ordinary 200 that took 19 seconds, indistinguishable from a reading with
// twelve offers on it. That difference is the whole product, and until now it
// was computed and thrown away.
//
// Deliberately carries no user input -- no departure city, no dates, no
// traveller count. That matches the standard the two existing log lines
// already set (see logUsage in oracle/aiClient.ts and the retry line in
// tutu/mcpClient.ts), and it means these lines stay safe to keep in
// production logs and to ship to any log collector without a data-retention
// conversation first. `destination` is our own atlas id, not something the
// traveller typed.
//
// Plain console.log rather than a logging library: the app has four runtime
// dependencies and this is not worth a fifth. Both hosts capture stdout --
// Vercel into its log drain, Docker into `docker logs` -- so the same line
// works before and after the move.

export interface RitualLogFacts {
  startedAt: number;
  destinationId: string;
  // null means the cards named no road at all -- the fog. Worth counting:
  // from outside it looks exactly like a successful reading.
  mode: string | null;
  transport: LegOutcome;
  hotels: LegOutcome;
  offerCount: number;
  // Whether the oracle's own words came from the AI or from the written-in
  // templates. The template path is supported, not broken -- but a sudden
  // run of `ai=miss` means the gateway is failing and nobody would otherwise
  // notice, because the page looks completely normal either way.
  aiAnswered: boolean;
  // Which entry point paid for this search: the fresh ritual on "/" or
  // someone opening a shared link. They cost the same and are worth telling
  // apart -- shared links are traffic the product earned rather than traffic
  // it was given.
  via: "ritual" | "share";
}

export function logRitual(facts: RitualLogFacts): void {
  const ms = Date.now() - facts.startedAt;
  console.log(
    `[ritual] ok via=${facts.via} ms=${ms} dest=${facts.destinationId} ` +
      `mode=${facts.mode ?? "none"} transport=${facts.transport} hotels=${facts.hotels} ` +
      `offers=${facts.offerCount} ai=${facts.aiAnswered ? "hit" : "miss"}`,
  );
}

// The failure path, which currently produces a bare 500 with no record of
// what broke or how far in. `stage` narrows it to the half that failed, and
// the error's own name is usually the whole answer -- AbortError is the 18s
// search budget running out, TypeError is almost always the network.
//
// The message is included but the stack is not: stacks are multi-line, which
// breaks one-line-per-event log parsing, and the throw sites here are few
// enough that the name and message locate them.
export function logRitualFailure(
  startedAt: number,
  stage: "search" | "narration" | "unknown",
  error: unknown,
  via: RitualLogFacts["via"] = "ritual",
): void {
  const ms = Date.now() - startedAt;
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ritual] failed via=${via} ms=${ms} stage=${stage} error=${name} message=${message}`);
}
