const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3100";

const CASES = [
  { name: "short haul (rail and bus, no air)", departureCity: "Москва", dateFrom: "2026-09-10", dateTo: "2026-09-13", travelerCount: 2 },
  { name: "long haul (air, absurd rail)", departureCity: "Санкт-Петербург", dateFrom: "2026-09-10", dateTo: "2026-09-17", travelerCount: 2 },
];

// This script exists to catch contract drift with the live Tutu MCP service —
// a renamed tool, a moved field, a rejected literal. Every such failure in this
// project's history passed the unit suite while returning nothing.
//
// So "no road came back" must NOT be a pass. The app deliberately degrades to a
// fog reading when MCP is unreachable, and that degradation is correct product
// behaviour — but it means the contract went unverified, which is exactly the
// state this script must refuse to bless. A green smoke run before a demo has to
// mean "the service answered and the contract holds", never "we could not tell".
let failed = false;
let verifiedCases = 0;

for (const testCase of CASES) {
  const { name, ...intent } = testCase;
  const started = Date.now();
  const response = await fetch(`${BASE}/api/ritual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  });
  const elapsed = Date.now() - started;
  const body = await response.json();

  const cards = body.spreadCards ?? [];
  const road = body.roadChoice ?? {};
  const problems = [];

  if (response.status !== 200) problems.push(`HTTP ${response.status}`);
  if (cards.length !== 3) problems.push(`expected 3 cards, got ${cards.length}`);
  if (road.mode && !cards[2]?.transport?.includes(road.mode)) {
    problems.push(`path card ${cards[2]?.id} does not serve ${road.mode}`);
  }
  if (road.best && !String(road.best.url || "").includes("tutu.ru")) {
    problems.push("hero road does not link to tutu.ru");
  }

  console.log(`\n${name}  ${elapsed}ms  ->  ${body.destination?.name ?? "?"}`);
  console.log(`  cards: ${cards.map((card) => `${card.name}${card.reversed ? "↓" : ""}`).join(", ")}`);
  console.log(`  road:  ${road.mode ?? "fog"}  ${road.best?.title ?? ""} ${road.best?.price ?? ""}`);
  if (body.warnings?.length) console.log(`  warnings: ${body.warnings.join(" | ")}`);
  if (road.mode && road.best) verifiedCases += 1;

  if (problems.length) {
    failed = true;
    console.log(`  FAIL: ${problems.join("; ")}`);
  }
}

if (verifiedCases === 0) {
  failed = true;
  console.log(
    "\nUNVERIFIED: no case produced a real road, so the MCP contract was never" +
      " exercised. The app degraded to its fog path, which is correct behaviour" +
      " but proves nothing. Check outbound access to mcp.tutu.ru before relying" +
      " on this run.",
  );
} else {
  console.log(`\nVERIFIED: ${verifiedCases}/${CASES.length} case(s) exercised the live MCP contract.`);
}

process.exit(failed ? 1 : 0);
