// The picture of a reading, shared by the two routes that want the same
// drawing at different sizes: the social preview (opengraph-image.tsx,
// 1200x630) and the thumbnail the «Мои расклады» list is built from
// (thumb/route.tsx, 600x215). Extracted rather than copied -- two hand-kept
// copies of a Satori tree would drift the first time a colour or a card size
// changed.
//
// `scale` multiplies every fixed dimension, so one composition serves both
// sizes. `withFooter` drops the two closing lines: they exist to explain a
// link someone received in a messenger, and in a list of your own readings
// they are noise -- there the tile *is* the link, so «Прочтите весь расклад
// по ссылке» is telling you to do what you are already doing.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedSharedReading } from "@/domain/share/reading";

// The image runtime does not inherit next/font (next/font's output only
// exists as a Next.js build-time/CSS mechanism for the HTML document; the
// separate Satori/resvg pipeline behind ImageResponse never sees it). Next's
// own docs for this ("Custom fonts", image-response.md) read the font as a
// plain file instead: `readFile` a real font file, hand its bytes to
// ImageResponse's own `fonts` option. That means an actual font file has to
// exist on disk -- these are real Prata/Manrope static instances (same two
// families globals.css's --font-display/--font-ui already use), subset down
// to Cyrillic+Latin+punctuation at prep time (see assets/fonts/OFL.txt for
// license provenance) and committed to the repo, so these routes never have
// to reach out to Google Fonts (or anywhere else) at request time -- the one
// trap this project calls out as the most likely accidental way to break its
// "no outbound request at runtime" rule.
//
// Read once, at module scope, not inside a request handler: the font files
// don't depend on which reading is being rendered (see Next's own
// "Predictable values" guidance in getting-started/caching.md).
const displayFontData = readFile(join(process.cwd(), "assets", "fonts", "Prata-Regular.ttf"));
const uiFontData = readFile(join(process.cwd(), "assets", "fonts", "Manrope-Regular.ttf"));

export async function readingArtFonts() {
  const [displayData, uiData] = await Promise.all([displayFontData, uiFontData]);
  return [
    { name: "Prata", data: displayData, style: "normal" as const, weight: 400 as const },
    { name: "Manrope", data: uiData, style: "normal" as const, weight: 400 as const },
  ];
}

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
// for these routes. Size: reading three of them plus two font files at
// request time risks the ImageResponse bundle-size ceiling ("Maximum
// bundle size of 500KB", image-response.md). Format: the bundled
// Satori/@vercel/og build has no `image/webp` case in the switch that reads
// a base64 data URI's dimensions, so a WebP data URI crashes it outright
// (see scripts/prepare-og-assets.mjs's own comment for the exact trace).
// These routes instead read pre-downscaled JPEG thumbnails from
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

export interface ArtOptions {
  // 1 draws the 1200x630 social preview; 0.5 draws the 600-wide thumbnail.
  scale?: number;
  withFooter?: boolean;
}

function BrandMark({ scale }: { scale: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Manrope",
        fontSize: Math.round(22 * scale),
        fontWeight: 400,
        letterSpacing: Math.round(6 * scale),
        textTransform: "uppercase",
        color: COLORS.gold,
      }}
    >
      Таро-турагент
    </div>
  );
}

export function FallbackArt({ scale = 1 }: { scale?: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: Math.round(24 * scale),
        background: COLORS.bg,
        color: COLORS.text,
      }}
    >
      <BrandMark scale={scale} />
      <div style={{ display: "flex", fontFamily: "Prata", fontSize: Math.round(48 * scale), color: COLORS.text }}>
        Три карты, одна дорога
      </div>
      <div style={{ display: "flex", fontFamily: "Manrope", fontSize: Math.round(24 * scale), color: COLORS.textDim }}>
        Разложите свой расклад: три карты выбирают направление
      </div>
    </div>
  );
}

export async function ReadingArt(
  { destination, spreadCards }: ResolvedSharedReading,
  { scale = 1, withFooter = true }: ArtOptions = {},
) {
  const px = (value: number) => Math.round(value * scale);
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
        padding: `${px(56)}px ${px(72)}px`,
        background: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.cloth} 100%)`,
        color: COLORS.text,
        fontFamily: "Manrope",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BrandMark scale={scale} />
        <div
          style={{
            display: "flex",
            fontSize: px(18),
            letterSpacing: px(3),
            textTransform: "uppercase",
            color: COLORS.textDim,
          }}
        >
          {destination.region}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: px(56) }}>
        <div style={{ display: "flex", flexDirection: "column", gap: px(22), flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Prata",
              fontSize: px(56),
              lineHeight: 1.15,
              color: COLORS.text,
            }}
          >
            Карты выбрали: {destination.name}
          </div>
          <div style={{ display: "flex", fontSize: px(23), lineHeight: 1.45, color: COLORS.textDim }}>
            {prophecy}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: px(18) }}>
          {spreadCards.map((card, index) => (
            <div
              key={card.id}
              style={{
                display: "flex",
                width: px(150),
                height: px(260),
                borderRadius: px(10),
                border: `${Math.max(1, px(2))}px solid ${COLORS.goldDeep}`,
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
              {/* eslint-disable-next-line @next/next/no-img-element --
                  Deliberate: this tree is rendered by Satori/resvg through
                  ImageResponse, not the browser DOM, so next/image has
                  nothing to optimise and would not survive the renderer. */}
              <img
                src={cardImages[index]}
                width={px(150)}
                height={px(260)}
                alt={`${card.name}${card.reversed ? ", перевёрнутая" : ""}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          ))}
        </div>
      </div>

      {withFooter ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${COLORS.line}`,
            paddingTop: px(24),
            fontSize: px(18),
            color: COLORS.textDim,
          }}
        >
          <div style={{ display: "flex" }}>Прочтите весь расклад по ссылке</div>
          <div style={{ display: "flex", color: COLORS.goldBright }}>Билеты ищутся заново при каждом открытии</div>
        </div>
      ) : null}
    </div>
  );
}
