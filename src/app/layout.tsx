import type { Metadata } from "next";
import { Manrope, Prata } from "next/font/google";
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
} as CSSProperties;

export const metadata: Metadata = {
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
