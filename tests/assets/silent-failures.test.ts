import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two classes of failure this project has actually shipped, both silent:
// nothing throws, nothing warns, no test goes red, and the only symptom is
// that an effect renders as nothing at all. Both were caught by
// screenshotting the running page and noticing an absence, which is a slow
// and unreliable way to find something a parser catches instantly.

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const FOG_DIR = join(process.cwd(), "public/fog");

// 1. An `animation: <name> ...` whose @keyframes block does not exist. CSS
//    resolves the shorthand happily and the element just keeps its base
//    style forever. This is how the full-screen fog came to be mounted,
//    positioned, sized, and painted -- and stuck at opacity 0, because a
//    tidy-up that removed the retired veil's keyframes took fog-roll,
//    fog-clear, fog-spin and fog-spin-reverse with it (they had been
//    inserted between the veil's own comment and its @keyframes block).
describe("every animation named in globals.css has keyframes", () => {
  const declared = new Set(
    [...CSS.matchAll(/^\s*@keyframes\s+([A-Za-z_][\w-]*)/gm)].map((m) => m[1]),
  );

  // The shorthand's other components must not be mistaken for a name.
  // Anything numeric or function-shaped is skipped by shape; the rest is the
  // finite set of CSS-wide and animation keywords.
  const KEYWORDS = new Set([
    "none", "initial", "inherit", "unset", "revert", "revert-layer",
    "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
    "normal", "reverse", "alternate", "alternate-reverse",
    "forwards", "backwards", "both", "running", "paused", "infinite",
  ]);

  const used = new Map<string, number>();
  CSS.split("\n").forEach((line, i) => {
    const decl = /^\s*animation(?:-name)?\s*:\s*([^;]+);/.exec(line);
    if (!decl) return;
    for (const raw of decl[1].split(/[\s,]+/)) {
      const name = raw.trim();
      if (!name || KEYWORDS.has(name)) continue;
      if (/^[\d.]/.test(name)) continue; // 620ms, .4s, 3
      if (name.includes("(")) continue; // cubic-bezier(...), var(...), steps(...)
      if (!used.has(name)) used.set(name, i + 1);
    }
  });

  // Guards the parser above: if the regexes ever stop matching, these
  // assertions fail loudly instead of the suite silently checking nothing.
  it("finds animations and keyframes to compare", () => {
    expect(used.size).toBeGreaterThan(8);
    expect(declared.size).toBeGreaterThan(8);
  });

  it.each([...used.entries()])("%s (globals.css:%i) has a @keyframes block", (name) => {
    expect([...declared]).toContain(name);
  });
});

// 2. An SVG that is not well-formed XML. Browsers do not fall back and do
//    not warn: the document fails to parse and the image renders as
//    nothing. Both fog layers shipped this way, because the house comment
//    style writes asides with a double hyphen, and XML forbids `--` inside
//    a comment.
describe("every fog SVG is well-formed XML", () => {
  const files = readdirSync(FOG_DIR).filter((f) => f.endsWith(".svg"));
  const parse = (source: string) =>
    new DOMParser().parseFromString(source, "image/svg+xml");

  it("finds SVGs to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Guards the guard: proves this environment's DOMParser actually reports
  // the failure mode being tested for, rather than quietly accepting
  // anything and making every assertion below vacuous.
  it("detects a malformed document", () => {
    const broken = parse('<svg xmlns="http://www.w3.org/2000/svg"><!-- a -- b --></svg>');
    expect(broken.querySelector("parsererror")).not.toBeNull();
  });

  it.each(files)("%s parses", (file) => {
    const doc = parse(readFileSync(join(FOG_DIR, file), "utf8"));
    expect(doc.querySelector("parsererror")?.textContent ?? null).toBeNull();
    expect(doc.documentElement.nodeName).toBe("svg");
  });
});
