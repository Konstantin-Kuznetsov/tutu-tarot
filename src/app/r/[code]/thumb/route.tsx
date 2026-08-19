import { ImageResponse } from "next/og";
import { decodeReading } from "@/domain/share/decode";
import { resolveSharedReading } from "@/domain/share/reading";
import { FallbackArt, ReadingArt, readingArtFonts } from "@/server/og/readingArt";

// Half-scale, footerless version of the social preview, for the tiles in
// «Мои расклады». A Route Handler rather than another metadata image,
// because this is not metadata for anything -- it is an image the list asks
// for directly (ImageResponse in a Route Handler: image-response.md, and
// `params` is a Promise in this version -- route.md).
//
// Why a separate route instead of the 1200x630 one scaled down in CSS: the
// full preview is ~405KB of PNG, and a list of ten readings would move four
// megabytes to draw thumbnails. Quartering the pixels is the honest fix;
// CSS cropping would have moved exactly the same bytes.
//
// 600x215 rather than 600x315: 215 is what the composition occupies once the
// footer is gone, so the image is drawn at its own natural height instead of
// being padded and then cropped by the tile.
const SIZE = { width: 600, height: 215 };

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const reading = decodeReading(code);
  const resolved = reading ? resolveSharedReading(reading) : null;

  return new ImageResponse(
    resolved
      ? await ReadingArt(resolved, { scale: 0.5, withFooter: false })
      : <FallbackArt scale={0.5} />,
    {
      ...SIZE,
      fonts: await readingArtFonts(),
      // The code fully determines the drawing -- same code, same three cards,
      // same destination, forever -- so a thumbnail never needs revalidating.
      // Without this every scroll past a tile would re-run Satori.
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
