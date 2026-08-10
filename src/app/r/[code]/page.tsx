import type { Metadata } from "next";
import { decodeReading } from "@/domain/share/code";
import { resolveSharedReading } from "@/domain/share/reading";
import { ritualSeed } from "@/domain/tarot/engine";
import type { TripIntent } from "@/domain/types";
import { createPrediction } from "@/server/oracle/narrator";
import { buildRoadChoiceAndSources } from "@/server/ritual/runRitual";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import { TravelResult, type RitualResultViewModel } from "@/components/TravelResult";

interface PageProps {
  params: Promise<{ code: string }>;
}

// This route runs a live Tutu MCP search (searchTutuOffers, an 18s budget --
// see SEARCH_BUDGET_MS in mcpClient.ts) and then narration, serially, at
// request time -- same shape as /api/ritual, which already carries this
// comment and this exact 30s ceiling. Without it, a cold shared link would
// inherit whatever the platform default is, which can be lower than what
// this page's own work needs: it would always pass locally (no cold start,
// warm connections) while risking a mid-search kill in production.
export const maxDuration = 30;

// The prophecy -- which three cards, which orientation, which destination,
// which road the third card named -- comes straight from the link and is
// never recomputed: that is the whole point of a share code. Only the
// prices are asked for again, through the same server-side search path the
// original ritual used, so a reading a stranger opens tomorrow shows today's
// tickets rather than a snapshot that might no longer be bookable.
async function loadSharedResult(code: string): Promise<RitualResultViewModel | null> {
  const reading = decodeReading(code);
  if (!reading) return null;

  const resolved = resolveSharedReading(reading);
  if (!resolved) return null;
  const { destination, spreadCards } = resolved;

  const intent: TripIntent = {
    departureCity: reading.departureCity,
    dateFrom: reading.dateFrom,
    dateTo: reading.dateTo,
    travelerCount: reading.travelerCount,
  };

  const offers = await searchTutuOffers({ intent, destination });
  const pathCard = spreadCards[2];
  const { roadChoice, sourceLinks } = buildRoadChoiceAndSources({
    mode: reading.mode,
    pathCard,
    transportOffers: offers.transport,
    modesSummary: offers.modesSummary,
    destination,
  });

  const prediction = await createPrediction({
    intent,
    spread: { seed: ritualSeed(intent), cards: spreadCards },
    selection: { destination, score: 0, reasons: [] },
    roadChoice,
    aiApiKey: process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
  });

  return {
    prediction,
    destination: { id: destination.id, name: destination.name, region: destination.region },
    spreadCards,
    roadChoice,
    sourceLinks,
    transportOffers: offers.transport,
    hotelOffers: offers.hotels,
    warnings: offers.warnings,
    intent,
  };
}

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
  const result = await loadSharedResult(code);

  if (!result) {
    return (
      <div className="table">
        <main className="result share-fallback">
          <h1>Таро-турагент</h1>
          <p className="ritual-status" role="alert">
            Эта ссылка не открылась — карты рассыпались или её кто-то подделал.
          </p>
          <a className="btn" href="/">Разложить свой расклад</a>
        </main>
      </div>
    );
  }

  return (
    <div className="table">
      <main className="result result--shared">
        <h1>Таро-турагент</h1>
        <p className="caps share-note">
          Карты и направление — те же, что выпали изначально. Билеты и отели ищутся заново, для свежих цен.
        </p>
        <TravelResult result={result} />
      </main>
    </div>
  );
}
