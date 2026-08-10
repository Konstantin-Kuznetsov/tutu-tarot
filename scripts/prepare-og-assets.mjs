// Prepares the small assets src/app/r/[code]/opengraph-image.tsx reads from
// disk at request time: a downscaled duotone thumbnail per tarot card.
//
// Why this exists rather than reading public/tarot/*.webp directly at full
// size: those scans are ~600x1039 (~140KB each); the OG canvas is
// 1200x630 with three cards in it at well under 200px wide apiece. Reading
// three full-size scans plus two font files at request time risks the
// ImageResponse bundle-size ceiling documented in Next's image-response
// docs ("Maximum bundle size of 500KB... includes JSX, CSS, fonts, images,
// and any other assets"). Downscaling once here, at dev/build time, keeps
// every request well under that regardless of which three cards are drawn
// -- there is no network fetch involved, both source and output are
// already-committed local files, and this only ever runs on demand (`npm
// run og:assets`), never at runtime.
//
// JPEG, not WebP: the source scans in public/tarot/ are WebP (browsers
// decode those fine), but the bundled Satori/@vercel/og build behind
// ImageResponse only special-cases `data:image/{png,apng,gif,jpeg}` when it
// parses a base64 data URI's dimensions -- there is no `image/webp` branch
// in that switch, so a WebP data URI's dimension lookup returns `undefined`
// and Satori crashes trying to spread it ("TypeError: u2 is not iterable",
// node_modules/next/dist/compiled/@vercel/og/index.node.js's `Gt`). PNG
// stays lossless but these duotone scans compress far worse than the
// hatching/paper-grain texture in them suggests (~145KB at this width);
// JPEG at quality 80 lands around 20-25KB with no visible loss at OG
// preview size.
//
// No re-processing of the duotone recipe here: the source is already the
// committed public/tarot output (see prepare-tarot-images.mjs for that
// pipeline), this script only resizes and re-encodes it.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC_DIR = path.join(process.cwd(), "public", "tarot");
const OUT_DIR = path.join(process.cwd(), "assets", "tarot-og");
const WIDTH = 220;
const QUALITY = 80;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(SRC_DIR)).filter((name) => name.endsWith(".webp"));

  for (const file of files) {
    const source = await readFile(path.join(SRC_DIR, file));
    const output = await sharp(source).resize({ width: WIDTH }).jpeg({ quality: QUALITY }).toBuffer();
    await writeFile(path.join(OUT_DIR, file.replace(/\.webp$/, ".jpg")), output);
  }

  console.log(`Wrote ${files.length} OG thumbnails to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
