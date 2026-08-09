import { access, mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// The duotone recipe from the design pass: --duotone-shadows and
// --duotone-lights in docs/design/tokens.css. Keep the two in sync.
const SHADOW = "#1d1426";
const HIGHLIGHT = "#e8c98a";

const WIDTH = 600;
const CACHE_DIR = path.join(process.cwd(), ".cache", "tarot-originals");
const OUT_DIR = path.join(process.cwd(), "public", "tarot");
const USER_AGENT = "TarotTravelAgent/0.1 (Tutu hackathon prototype)";
const THROTTLE_MS = 3000;

const CARDS = [
  ["00-fool", "RWS_Tarot_00_Fool.jpg"],
  ["01-magician", "RWS_Tarot_01_Magician.jpg"],
  ["02-priestess", "RWS_Tarot_02_High_Priestess.jpg"],
  ["03-empress", "RWS_Tarot_03_Empress.jpg"],
  ["04-emperor", "RWS_Tarot_04_Emperor.jpg"],
  ["05-hierophant", "RWS_Tarot_05_Hierophant.jpg"],
  ["06-lovers", "RWS_Tarot_06_Lovers.jpg"],
  ["07-chariot", "RWS_Tarot_07_Chariot.jpg"],
  ["08-strength", "RWS_Tarot_08_Strength.jpg"],
  ["09-hermit", "RWS_Tarot_09_Hermit.jpg"],
  ["10-wheel", "RWS_Tarot_10_Wheel_of_Fortune.jpg"],
  ["11-justice", "RWS_Tarot_11_Justice.jpg"],
  ["12-hanged", "RWS_Tarot_12_Hanged_Man.jpg"],
  ["13-death", "RWS_Tarot_13_Death.jpg"],
  ["14-temperance", "RWS_Tarot_14_Temperance.jpg"],
  ["15-devil", "RWS_Tarot_15_Devil.jpg"],
  ["16-tower", "RWS_Tarot_16_Tower.jpg"],
  ["17-star", "RWS_Tarot_17_Star.jpg"],
  ["18-moon", "RWS_Tarot_18_Moon.jpg"],
  ["19-sun", "RWS_Tarot_19_Sun.jpg"],
  ["20-judgement", "RWS_Tarot_20_Judgement.jpg"],
  ["21-world", "RWS_Tarot_21_World.jpg"],
];

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function fetchOriginal(commonsName, cacheFile) {
  if (await exists(cacheFile)) return readFile(cacheFile);

  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${commonsName}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`${commonsName} -> HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());

  // Validate that bytes are a fully decodable image before caching. This ensures
  // bad responses (interstitials, maintenance pages, truncated bodies) are not
  // cached as if they were valid originals, which would cause the script to
  // fail identically on every future run. A header-only read via metadata()
  // is insufficient — a truncated JPEG passes header validation but fails on
  // full decode. We decode the full scan by resizing to a tiny width, which
  // forces the entire source to be scanned.
  try {
    await sharp(bytes).resize({ width: 32 }).toBuffer();
  } catch (err) {
    throw new Error(`${commonsName} -> failed to decode image: ${err.message}`);
  }

  // Write atomically: to a temp file first, then rename into the final cache
  // path. rename() within one filesystem is atomic, so a killed process cannot
  // leave a half-written file at the cache path where the early return would
  // replay it.
  const tempFile = `${cacheFile}.tmp`;
  try {
    await writeFile(tempFile, bytes);
    await rename(tempFile, cacheFile);
  } catch (err) {
    // Clean up the temp file if writing or renaming failed.
    try {
      await unlink(tempFile);
    } catch {
      // Ignore errors during cleanup; the real error is thrown below.
    }
    throw err;
  }

  await sleep(THROTTLE_MS);
  return bytes;
}

function vignette(width, height) {
  return Buffer.from(
    `<svg width="${width}" height="${height}">
       <defs>
         <radialGradient id="v" cx="50%" cy="50%" r="75%">
           <stop offset="55%" stop-color="#ffffff"/>
           <stop offset="100%" stop-color="#8d7f96"/>
         </radialGradient>
       </defs>
       <rect width="${width}" height="${height}" fill="url(#v)"/>
     </svg>`,
  );
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const lo = hexToRgb(SHADOW);
  const hi = hexToRgb(HIGHLIGHT);
  const slope = [(hi.r - lo.r) / 255, (hi.g - lo.g) / 255, (hi.b - lo.b) / 255];
  const offset = [lo.r, lo.g, lo.b];

  for (const [id, commonsName] of CARDS) {
    const original = await fetchOriginal(commonsName, path.join(CACHE_DIR, commonsName));

    const base = sharp(original).resize({ width: WIDTH });
    const { width, height } = await base.clone().toBuffer({ resolveWithObject: true })
      .then((result) => result.info);

    const output = await base
      .clone()
      .greyscale()
      .toColourspace("srgb")
      .linear(slope, offset)
      .composite([{ input: vignette(width, height), blend: "multiply" }])
      .webp({ quality: 82 })
      .toBuffer();

    await writeFile(path.join(OUT_DIR, `${id}.webp`), output);
    console.log(`${id}.webp  ${(output.length / 1024).toFixed(0)} KB  ${width}x${height}`);
  }
}

await main();
