import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { decodeReading } from "@/domain/share/decode";
import { resolveSharedReading } from "@/domain/share/reading";
import type { TravelAtlasItem, TripIntent } from "@/domain/types";
import { GuideStrip, SeasonMismatchNote, blockIndexStyle, type RitualResultViewModel } from "@/components/TravelResult";
import { TarotCardView } from "@/components/TarotCardView";
import { SharedReadingLive } from "@/components/SharedReadingLive";

interface PageProps {
  params: Promise<{ code: string }>;
}

// This route's streamed half (SharedReadingLive, below) runs a live Tutu MCP
// search (searchTutuOffers, an 18s budget -- see SEARCH_BUDGET_MS in
// mcpClient.ts) and then narration -- same shape as /api/ritual, which
// already carries this comment and this exact 30s ceiling. Without it, a
// cold shared link would inherit whatever the platform default is, which
// can be lower than what this route's own work needs: it would always pass
// locally (no cold start, warm connections) while risking a mid-search kill
// in production.
export const maxDuration = 30;

// The frozen half of `RitualResultViewModel.destination` (see that type's
// own comment): everything GuideStrip/SeasonMismatchNote read, copied over
// by hand from the atlas item resolveSharedReading already resolved -- no
// network needed for any of it.
function destinationViewModel(destination: TravelAtlasItem): RitualResultViewModel["destination"] {
  return {
    id: destination.id,
    name: destination.name,
    region: destination.region,
    source: destination.source,
    sourceUrl: destination.sourceUrl,
    routeDays: destination.routeDays,
    rating: destination.rating,
    seasonWindow: destination.seasonWindow,
  };
}

// Shown in place of the road/offers/narration block while SharedReadingLive
// is still awaiting the search -- in the product's own voice (the exact
// phrase RitualScene already shows on "/" while the fresh ritual's own
// search is in flight), not a generic spinner.
function SharedReadingFallback() {
  return (
    <p className="ritual-status" role="status" data-block="live-fallback" style={blockIndexStyle(2)}>
      Оракул сверяется с дорогами Туту…
    </p>
  );
}

// The prophecy -- which three cards, which orientation, which destination,
// which road the third card named -- comes straight from the link and is
// never recomputed: that is the whole point of a share code. Only the
// prices are asked for again, through the same server-side search path the
// original ritual used, so a reading a stranger opens tomorrow shows today's
// tickets rather than a snapshot that might no longer be bookable.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const reading = decodeReading(code);
  const resolved = reading ? resolveSharedReading(reading) : null;

  if (!resolved) {
    return {
      title: "Таро-турагент — расклад",
      description: "Три настоящие карты называют направление, Туту подтверждает дорогу настоящими билетами.",
    };
  }

  const { destination } = resolved;
  return {
    title: `Карты выбрали: ${destination.name} — Таро-турагент`,
    description: `Три карты назвали ${destination.name}. Билеты и отели ищутся заново прямо сейчас — цены всегда свежие.`,
  };
}

export default async function SharedReadingPage({ params }: PageProps) {
  const { code } = await params;
  const reading = decodeReading(code);
  const resolved = reading ? resolveSharedReading(reading) : null;

  if (!reading || !resolved) {
    return (
      <div className="reading-table">
        <main className="result share-fallback">
          <h1>Таро-турагент</h1>
          <p className="ritual-status" role="alert">
            Эта ссылка не открылась — карты рассыпались или её кто-то подделал.
          </p>
          <Link className="btn" href="/">Разложить свой расклад</Link>
        </main>
      </div>
    );
  }

  const { destination, spreadCards } = resolved;
  const intent: TripIntent = {
    departureCity: reading.departureCity,
    dateFrom: reading.dateFrom,
    dateTo: reading.dateTo,
    travelerCount: reading.travelerCount,
  };
  const destinationVm = destinationViewModel(destination);

  return (
    <div className="reading-table">
      <main className="result result--shared">
        <h1>Таро-турагент</h1>
        <p className="caps share-note">
          Карты и направление — те же, что выпали изначально. Билеты и отели ищутся заново, для свежих цен.
        </p>
        <section className="travel-result">
          {/* The frozen half: resolveSharedReading gives the three cards,
              their orientations and the destination straight from the link
              itself, with no network call at all -- so this renders in the
              static shell, flushed immediately, before SharedReadingLive
              below has even started its search. The headline is
              deterministic too (createPrediction always sets it to exactly
              this string -- see narrator.ts) so it can render here rather
              than waiting on the narration call that decides the rest of
              the prediction panel's prose. */}
          <div className="prediction-panel" data-block="prediction" style={blockIndexStyle(0)}>
            <p className="result-kicker">Предсказанный маршрут</p>
            <h2>Карты указывают: {destination.name}</h2>
            <GuideStrip destination={destinationVm} />
            <SeasonMismatchNote destination={destinationVm} intent={intent} />
          </div>
          <section className="spread-panel" data-block="spread" aria-label="Расклад карт" style={blockIndexStyle(1)}>
            <div className="spread-panel__header">
              <p className="result-kicker">Расклад карт</p>
              <h3>Три знака дороги</h3>
            </div>
            <div className="spread-grid">
              {spreadCards.map((card, index) => (
                <div
                  className="spread-card-shell"
                  key={`${card.position}-${card.id}`}
                  style={{ "--card-order": index } as CSSProperties}
                >
                  {/* No readingText: the per-card written reading comes out
                      of createPrediction, which streams in below -- until
                      then TarotCardView falls back to the deck's own
                      meaning, exactly as it does everywhere else a reading
                      hasn't been written yet. */}
                  <TarotCardView card={card} revealed testId="spread-card" />
                </div>
              ))}
            </div>
          </section>
          {/* The streamed half: road, offers, and the rest of the oracle's
              prose (see SharedReadingLive's own comment), none of which can
              be known before the search settles. Suspense is what actually
              makes this stream -- Next flushes everything above immediately
              and swaps this boundary's fallback for the real content once
              the awaits inside SharedReadingLive resolve. */}
          <Suspense fallback={<SharedReadingFallback />}>
            <SharedReadingLive reading={reading} destination={destination} spreadCards={spreadCards} intent={intent} />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
