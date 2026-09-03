import type { Metadata } from "next";
import { Instrument_Serif, Manrope, Prata } from "next/font/google";
import type { CSSProperties } from "react";
import "./globals.css";

// Self-hosted via next/font/google so no request ever goes to
// fonts.googleapis.com at runtime — the mockup's <link rel="stylesheet">
// tags are deliberately not ported. Both Prata and Manrope ship a cyrillic
// subset (verified 2026-08-09 against the Google Fonts CSS API).
const displayFont = Prata({
  subsets: ["cyrillic", "latin"],
  weight: "400",
  display: "swap",
});

const uiFont = Manrope({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Instrument Serif, for the Lumora hero (LumoraHero.tsx). Loaded through
// next/font/google for exactly the reason the two above are — the spec asked
// for <link rel="stylesheet"> tags to fonts.googleapis.com, which would be
// the only runtime font request in an app that self-hosts everything else.
// Latin only: it ships no cyrillic subset, and the hero's copy is English.
// Both styles, because the logo is the italic and the heading is upright.
const lumoraFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

// globals.css's ported `:root` block already declares --font-display and
// --font-ui with the mockup's literal Google Font names ('Prata', serif /
// 'Manrope', sans-serif) — kept byte-identical to the token source, per
// Task 8's brief, rather than edited to reference next/font's output.
// Setting the same two custom properties again here, inline on <html>,
// overrides that stylesheet declaration unconditionally (inline `style`
// always wins over any selector, regardless of stylesheet load order) and
// points them at the actual self-hosted font-family next/font generated.
// The result: every ported rule that reads var(--font-display)/var(--font-ui)
// keeps working unchanged, and renders the real self-hosted font.
const fontVariableStyle = {
  "--font-display": displayFont.style.fontFamily,
  "--font-ui": uiFont.style.fontFamily,
  "--font-lumora": lumoraFont.style.fontFamily,
} as CSSProperties;

// `metadataBase` is what turns the relative image path Next generates for
// `opengraph-image` into the absolute URL a messenger can actually fetch.
//
// Set only when an origin was actually configured, and left undefined
// otherwise so Next's own fallback still runs -- on Vercel that resolves to
// the deployment's real URL, which is what kept sharing working before this
// line existed. Hardcoding a localhost default here instead broke exactly
// that, silently and with a green build. See next.config.ts for the full
// account.
export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_ORIGIN
    ? new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN)
    : undefined,
  title: "Таро-турагент",
  description: "Мистический подбор путешествий по России с маршрутами и отелями Туту.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" style={fontVariableStyle}>
      <body>{children}</body>
    </html>
  );
}
