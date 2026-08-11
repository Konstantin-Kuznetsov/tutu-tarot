import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { decodeReading } from "@/domain/share/decode";
import { resolveSharedReading, type ResolvedSharedReading } from "@/domain/share/reading";

export const alt = "Таро-турагент — расклад: три карты и направление поездки";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image runtime does not inherit next/font (next/font's output only
// exists as a Next.js build-time/CSS mechanism for the HTML document; the
// separate Satori/resvg pipeline behind ImageResponse never sees it). Next's
// own docs for this ("Custom fonts", image-response.md) read the font as a
// plain file instead: `readFile` a real font file, hand its bytes to
// ImageResponse's own `fonts` option. That means an actual font file has to
// exist on disk -- these are real Prata/Manrope static instances (same two
// families globals.css's --font-display/--font-ui already use), subset down
// to Cyrillic+Latin+punctuation at prep time (see assets/fonts/OFL.txt for
// license provenance) and committed to the repo, so this route never has to
// reach out to Google Fonts (or anywhere else) at request time -- the one
// trap this task calls out as the most likely accidental way to break the
// project's "no outbound request at runtime" rule.
//
// Read once, at module scope, not inside the request handler below: the
// font files don't depend on which reading is being rendered (see Next's
// own "Predictable values" guidance in getting-started/caching.md).
const displayFontData = readFile(join(process.cwd(), "assets", "fonts", "Prata-Regular.ttf"));
const uiFontData = readFile(join(process.cwd(), "assets", "fonts", "Manrope-Regular.ttf"));

const COLORS = {
  bg: "#0f0b15",
  cloth: "#191024",
  line: "#463357",
  goldDeep: "#7d5c1e",
  gold: "#d9a441",
  goldBright: "#f2c66d",
  text: "#f4edde",
  textDim: "#c9b89e",
  duotoneShadow: "#1d1426",
};

// The card art under public/tarot/ is what TarotCardView shows in the app,
// but those scans are full-size (~140KB apiece, and WebP) -- two problems
// for this route. Size: reading three of them plus two font files at
// request time risks the ImageResponse bundle-size ceiling ("Maximum
// bundle size of 500KB", image-response.md). Format: the bundled
// Satori/@vercel/og build has no `image/webp` case in the switch that reads
// a base64 data URI's dimensions, so a WebP data URI crashes it outright
// (see scripts/prepare-og-assets.mjs's own comment for the exact trace).
// This route instead reads pre-downscaled JPEG thumbnails from
// assets/tarot-og/ (~20-25KB each, prepared by that script from the
// already-committed public/tarot output -- no network fetch there either).
// Still a local file, still only the three cards actually being shown, per
// the same "nothing fetches cards that aren't in this reading" rule the
// rest of the project holds.
async function cardImageDataUrl(image: string): Promise<string> {
  const basename = (image.split("/").pop() ?? "").replace(/\.webp$/, ".jpg");
  const bytes = await readFile(join(process.cwd(), "assets", "tarot-og", basename));
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function BrandMark() {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Manrope",
        fontSize: 22,
        fontWeight: 400,
        letterSpacing: 6,
        textTransform: "uppercase",
        color: COLORS.gold,
      }}
    >
      Таро-турагент
    </div>
  );
}

function FallbackArt() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: COLORS.bg,
        color: COLORS.text,
      }}
    >
      <BrandMark />
      <div style={{ display: "flex", fontFamily: "Prata", fontSize: 48, color: COLORS.text }}>
        Три карты, одна дорога
      </div>
      <div style={{ display: "flex", fontFamily: "Manrope", fontSize: 24, color: COLORS.textDim }}>
        Разложите свой расклад: три карты выбирают направление
      </div>
    </div>
  );
}

async function ReadingArt({ destination, spreadCards }: ResolvedSharedReading) {
  const cardImages = await Promise.all(spreadCards.map((card) => cardImageDataUrl(card.image)));
  // oracleHook is already written as a one-line prophecy in the atlas
  // ("Каменные столбы обещают путь..."), and unlike the actual prediction
  // text it needs no offer search to produce -- it's local data, so the
  // image never has to wait on (or degrade because of) a live Tutu search.
  const prophecy = destination.oracleHook;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px",
        background: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.cloth} 100%)`,
        color: COLORS.text,
        fontFamily: "Manrope",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BrandMark />
        <div
          style={{
            display: "flex",
            fontSize: 18,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: COLORS.textDim,
          }}
        >
          {destination.region}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Prata",
              fontSize: 56,
              lineHeight: 1.15,
              color: COLORS.text,
            }}
          >
            Карты выбрали: {destination.name}
          </div>
          <div style={{ display: "flex", fontSize: 23, lineHeight: 1.45, color: COLORS.textDim }}>
            {prophecy}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
          {spreadCards.map((card, index) => (
            <div
              key={card.id}
              style={{
                display: "flex",
                width: 150,
                height: 260,
                borderRadius: 10,
                border: `2px solid ${COLORS.goldDeep}`,
                overflow: "hidden",
                background: COLORS.duotoneShadow,
                // Omitted entirely rather than set to `undefined` when
                // upright: Satori's style processor tries to tokenize
                // whatever value the `transform` key holds, and a literal
                // `undefined` crashes that parser ("u2 is not iterable")
                // instead of being treated as "no transform".
                ...(card.reversed ? { transform: "rotate(180deg)" } : {}),
              }}
            >
              {/* Raw <img>, not next/image: this tree is rendered by
                  Satori/resvg through ImageResponse, not the browser DOM. */}
              <img
                src={cardImages[index]}
                width={150}
                height={260}
                alt={`${card.name}${card.reversed ? ", перевёрнутая" : ""}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `1px solid ${COLORS.line}`,
          paddingTop: 24,
          fontSize: 18,
          color: COLORS.textDim,
        }}
      >
        <div style={{ display: "flex" }}>Прочтите весь расклад по ссылке</div>
        <div style={{ display: "flex", color: COLORS.goldBright }}>Билеты ищутся заново при каждом открытии</div>
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const reading = decodeReading(code);
  const resolved = reading ? resolveSharedReading(reading) : null;

  const [displayData, uiData] = await Promise.all([displayFontData, uiFontData]);
  const fonts = [
    { name: "Prata", data: displayData, style: "normal" as const, weight: 400 as const },
    { name: "Manrope", data: uiData, style: "normal" as const, weight: 400 as const },
  ];

  return new ImageResponse(resolved ? await ReadingArt(resolved) : <FallbackArt />, { ...size, fonts });
}
