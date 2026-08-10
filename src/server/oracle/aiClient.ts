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

// Caps completion length so a misbehaving model can't bill for thousands of
// tokens on a single reading. The validator (validate.ts) already bounds
// every text field -- three card readings plus a closing line -- at 400
// characters each, so the JSON reply never legitimately needs more than
// ~1,600 characters of prose plus its own object/array/key punctuation (ids,
// braces, quotes): call it ~1,800 characters worst case. Cyrillic tokenizes
// less efficiently than English (roughly 1.5-2 characters per token instead
// of ~4), so that reply can cost up to ~1,200 tokens even when every field
// is fully used. 1,500 leaves headroom for that worst case without leaving
// the ceiling anywhere near "thousands of tokens" for a runaway response.
const MAX_COMPLETION_TOKENS = 1_500;

// Most corporate AI gateways expose an OpenAI-compatible chat-completions
// endpoint, so that shape is the default. api.openai.com itself is only
// ever reached if no AI_BASE_URL is configured.
export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_AI_MODEL = "gpt-4.1-mini";

// The rest of the page (share-note, buttons, dates) is written in formal
// "вы" -- the standard register for a Russian product addressing a stranger
// -- so the model's own prose is told to match it explicitly, word by word,
// rather than trusting a vague "be formal" to survive translation into
// generation. Plain "be formal" left the model defaulting to "ты" in
// production regardless (see the fix commit this line belongs to for real
// examples), which is why the instruction below spells out both pronoun
// sets. An impersonal, address-free voice was the other option considered
// -- it would also stop the clash -- but an oracle addressing the person
// whose reading this is reads warmer and more direct than a voice that
// never says "you" at all, so "вы" was kept as the app's one address form
// and simply requested from the model too.
const SYSTEM_PROMPT = [
  "Ты — таролог-рассказчик мистического приложения, которое подбирает путешествие по России с помощью карт Таро.",
  "Тебе присылают три уже вытянутые карты (с позицией в раскладе и тем, выпала ли карта перевёрнутой) и уже выбранное направление (название и регион).",
  "Направление уже выбрано приложением по другим правилам — ты не выбираешь и не меняешь его, только пишешь о картах и о том, как они ведут к этому направлению.",
  "Не называй никакое другое направление, город или место, кроме единственного, что дано в запросе.",
  "Если в тексте карты обращаются к человеку, для которого сделан расклад, обращайся только на «вы» — вежливая форма (вы, вам, вас, ваш, откройтесь), а не на «ты» (тебе, тебя, твой, откройся): это единственное обращение, которое использует остальной текст приложения.",
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

// OpenAI-compatible gateways report token counts on `data.usage`
// (`prompt_tokens`/`completion_tokens`/`total_tokens`). Read defensively,
// like extractMessageText above -- a gateway that omits or reshapes usage
// should degrade to an incomplete log line, never throw.
function extractUsage(data: unknown): { prompt?: number; completion?: number; total?: number } | undefined {
  if (!data || typeof data !== "object") return undefined;
  const usage = (data as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;

  const record = usage as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  return {
    prompt: typeof record.prompt_tokens === "number" ? record.prompt_tokens : undefined,
    completion: typeof record.completion_tokens === "number" ? record.completion_tokens : undefined,
    total: typeof record.total_tokens === "number" ? record.total_tokens : undefined,
  };
}

// The only server-side record of what a reading actually cost: token counts
// and the model that produced them, one concise line per successful gateway
// call (a call that returned an HTTP-ok response with a body -- billed
// regardless of whether validateNarration later accepts or rejects the
// content, since the gateway is paid for tokens generated, not for text
// that passes validation). Deliberately carries nothing else -- no prompt,
// no model output, no card or destination data -- so this line is safe to
// leave in production logs.
function logUsage(data: unknown, model: string): void {
  const usage = extractUsage(data);
  if (!usage) return;
  console.log(
    `[oracle] narration usage model=${model} prompt_tokens=${usage.prompt ?? "?"} completion_tokens=${usage.completion ?? "?"} total_tokens=${usage.total ?? "?"}`,
  );
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
        max_tokens: MAX_COMPLETION_TOKENS,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as unknown;
    logUsage(data, config.model);

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
