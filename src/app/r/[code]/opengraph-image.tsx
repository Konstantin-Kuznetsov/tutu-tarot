import { ImageResponse } from "next/og";
import { decodeReading } from "@/domain/share/decode";
import { resolveSharedReading } from "@/domain/share/reading";
import { FallbackArt, ReadingArt, readingArtFonts } from "@/server/og/readingArt";

export const alt = "Таро-турагент — расклад: три карты и направление поездки";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The social preview: full size, and with the closing lines that explain to
// someone receiving this in a messenger what they are looking at. The
// drawing itself lives in @/server/og/readingArt, shared with the thumbnail
// route next door -- see that module for why.
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const reading = decodeReading(code);
  const resolved = reading ? resolveSharedReading(reading) : null;

  return new ImageResponse(
    resolved ? await ReadingArt(resolved) : <FallbackArt />,
    {
      ...size,
      fonts: await readingArtFonts(),
      // Measured on the Vercel deployment: this route answered MISS on every
      // request and spent ~1.25s re-rendering the same PNG, because unlike the
      // thumbnail next door it sent `max-age=0, must-revalidate`. The drawing
      // is a pure function of the code in the URL -- the same link can only
      // ever produce the same image -- so there is nothing to revalidate.
      //
      // It matters more off Vercel than on it: every unfurl of one link in a
      // group chat is a separate Satori render, and Satori is the only genuinely
      // CPU-bound work this app does. On a single-process `next start` those
      // renders compete with real requests for the one thread.
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
