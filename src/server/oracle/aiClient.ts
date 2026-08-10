import type { TarotPosition } from "@/domain/types";
import { validateNarration, type AiNarration } from "@/server/oracle/validate";

// Exactly what the model needs to write three card readings and a closing
// line, and nothing else -- no other atlas entries, no offer titles, no
// traveller counts. Every extra place name in the prompt is a place name
// that could come back out in the reply.
export interface NarrationCardInput {
  id: string;
  name: string;
  position: TarotPosition;
  reversed: boolean;
}

export interface NarrationRequestInput {
  cards: NarrationCardInput[];
  destinationName: string;
  destinationRegion: string;
}

// Every varying part of talking to a gateway is configuration, not code, so
// that pointing this at a different corporate AI gateway is an environment
// change. `api.openai.com` appears exactly once in this file (see
// DEFAULT_AI_BASE_URL below) as the documented default -- never elsewhere.
export interface AiClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  authHeader: string;
  authPrefix: string;
}

// The route this feeds (POST /api/ritual and the shared-reading page) has a
// 30s ceiling and the Tutu MCP search that runs first can already spend up
// to 18s of it (see SEARCH_BUDGET_MS in mcpClient.ts). 8s leaves comfortable
// room for the rest of the response after a worst-case search, so a slow or
// unreachable gateway degrades the copy -- never the request.
const AI_TIMEOUT_MS = 8_000;

// Most corporate AI gateways expose an OpenAI-compatible chat-completions
// endpoint, so that shape is the default. api.openai.com itself is only
// ever reached if no AI_BASE_URL is configured.
export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_AI_MODEL = "gpt-4.1-mini";

const SYSTEM_PROMPT = [
  "Ты — таролог-рассказчик мистического приложения, которое подбирает путешествие по России с помощью карт Таро.",
  "Тебе присылают три уже вытянутые карты (с позицией в раскладе и тем, выпала ли карта перевёрнутой) и уже выбранное направление (название и регион).",
  "Направление уже выбрано приложением по другим правилам — ты не выбираешь и не меняешь его, только пишешь о картах и о том, как они ведут к этому направлению.",
  "Не называй никакое другое направление, город или место, кроме единственного, что дано в запросе.",
  "Верни строго один JSON-объект без markdown, без пояснений и без кодовых блоков, ровно такой формы:",
  '{"cardReadings":[{"id":"<id карты>","text":"..."},{"id":"<id карты>","text":"..."},{"id":"<id карты>","text":"..."}],"closingLine":"..."}',
  "В cardReadings должно быть ровно три записи — по одной на каждую присланную карту, id каждой записи должен в точности совпадать с id карты из запроса.",
  "Каждое поле text и closingLine — связный текст на русском языке (кириллица), от 20 до 400 символов, без ссылок и адресов сайтов, без markdown-разметки и HTML-тегов.",
].join(" ");

function buildUserPayload(input: NarrationRequestInput) {
  return {
    cards: input.cards.map((card) => ({
      id: card.id,
      name: card.name,
      position: card.position,
      reversed: card.reversed,
    })),
    destination: {
      name: input.destinationName,
      region: input.destinationRegion,
    },
  };
}

// A gateway may answer with either the chat-completions envelope
// (`choices[0].message.content`) or a `/v1/responses`-style envelope
// (`output[0].content[0].text`, with `output_text` as an SDK convenience
// field some providers also send directly). Handle both defensively rather
// than assuming one shape, since AI_BASE_URL can point at either.
function extractMessageText(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const record = data as { choices?: unknown; output_text?: unknown; output?: unknown };

  if (Array.isArray(record.choices)) {
    const first = record.choices[0];
    if (first && typeof first === "object") {
      const message = (first as { message?: unknown }).message;
      if (message && typeof message === "object") {
        const content = (message as { content?: unknown }).content;
        if (typeof content === "string") return content;
      }
    }
  }

  if (typeof record.output_text === "string") return record.output_text;

  if (Array.isArray(record.output)) {
    for (const item of record.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
          return (block as { text: string }).text;
        }
      }
    }
  }

  return undefined;
}

// Some models wrap otherwise-valid JSON in a ```json ... ``` fence despite
// being told not to. Stripping a leading/trailing fence is extraction, not
// a validation rule -- validateNarration below still applies every content
// check to whatever text remains, so this cannot loosen what gets accepted.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

// Fetches a narration from the configured gateway and validates it before
// returning. Any failure -- missing config, network error, timeout,
// non-JSON reply, a reply that fails validateNarration's content checks --
// resolves to null, never throws and never rejects, so the caller can
// always fall back to the template unconditionally.
export async function requestNarration(input: NarrationRequestInput, config: AiClientConfig): Promise<AiNarration | null> {
  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        [config.authHeader]: `${config.authPrefix}${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(buildUserPayload(input)) },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as unknown;
    const text = extractMessageText(data);
    if (!text) return null;

    return validateNarration(stripCodeFence(text), {
      cardIds: input.cards.map((card) => card.id),
      destinationName: input.destinationName,
    });
  } catch {
    return null;
  }
}
