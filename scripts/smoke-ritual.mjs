const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3100";

const CASES = [
  { name: "short haul (rail and bus, no air)", departureCity: "Москва", dateFrom: "2026-09-10", dateTo: "2026-09-13", travelerCount: 2 },
  { name: "long haul (air, absurd rail)", departureCity: "Санкт-Петербург", dateFrom: "2026-09-10", dateTo: "2026-09-17", travelerCount: 2 },
];

let failed = false;

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
  if (problems.length) {
    failed = true;
    console.log(`  FAIL: ${problems.join("; ")}`);
  }
}

process.exit(failed ? 1 : 0);
