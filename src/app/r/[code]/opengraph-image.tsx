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
    { ...size, fonts: await readingArtFonts() },
  );
}
