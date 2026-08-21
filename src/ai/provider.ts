import "server-only";

// ---------------------------------------------------------------------------
// Provider abstraction. The rest of the app asks for "a completion" and never
// learns which model answered, or whether one answered at all. Keys stay on
// the server — no provider SDK is shipped to the browser and no key is ever
// serialised into a response.
//
// Selection order: explicit AI_PROVIDER, else the first provider with
// credentials, else none. "None" is a first-class, fully supported mode: every
// caller has a deterministic offline fallback (see src/ai/fallback.ts).
// ---------------------------------------------------------------------------

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiImage {
  /** e.g. "image/png". */
  mediaType: string;
  /** Base64 payload with no data: prefix. */
  base64: string;
}

export interface CompletionRequest {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  /** When set, the model is told to reply with JSON matching this shape. */
  jsonHint?: string;
  /** Attached to the first user message. Used for OCR and handwriting. */
  images?: AiImage[];
}

export interface AiProvider {
  name: string;
  model: string;
  complete(request: CompletionRequest): Promise<string>;
}

const TIMEOUT_MS = 45_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attach images to the first user message in whichever content-block shape the
 * provider expects. Text-only requests keep their plain string content, so the
 * common path stays identical to what each API documents.
 */
function withImages(
  request: CompletionRequest,
  build: (text: string, images: AiImage[]) => unknown[],
): unknown[] {
  if (!request.images?.length) return request.messages;
  const [first, ...rest] = request.messages;
  if (!first) return request.messages;
  return [{ role: first.role, content: build(first.content, request.images) }, ...rest];
}

function anthropicProvider(): AiProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  return {
    name: "anthropic",
    model,
    async complete(request) {
      const res = await postJson(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": key, "anthropic-version": "2023-06-01" },
        {
          model,
          max_tokens: request.maxTokens ?? 1200,
          temperature: request.temperature ?? 0.3,
          system: request.jsonHint
            ? `${request.system}\n\nReply with JSON only, matching: ${request.jsonHint}`
            : request.system,
          messages: withImages(request, (text, images) => [
            ...images.map((image) => ({
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            })),
            { type: "text", text },
          ]),
        },
      );
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (json.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim();
    },
  };
}

/**
 * Any OpenAI-compatible endpoint: OpenRouter's free tier, Groq, Together, or a
 * local llama.cpp server. This is the route to a genuinely free model without
 * the app taking a hard dependency on one vendor's uptime or pricing.
 */
function openAiCompatibleProvider(): AiProvider | null {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
  const key = process.env.OPENAI_COMPATIBLE_API_KEY;
  const model = process.env.OPENAI_COMPATIBLE_MODEL;
  if (!baseUrl || !model) return null;
  return {
    name: "openai-compatible",
    model,
    async complete(request) {
      const res = await postJson(
        `${baseUrl.replace(/\/$/, "")}/chat/completions`,
        key ? { authorization: `Bearer ${key}` } : {},
        {
          model,
          max_tokens: request.maxTokens ?? 1200,
          temperature: request.temperature ?? 0.3,
          ...(request.jsonHint ? { response_format: { type: "json_object" } } : {}),
          messages: [
            {
              role: "system",
              content: request.jsonHint
                ? `${request.system}\n\nReply with JSON only, matching: ${request.jsonHint}`
                : request.system,
            },
            ...withImages(request, (text, images) => [
              { type: "text", text },
              ...images.map((image) => ({
                type: "image_url",
                image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
              })),
            ]),
          ],
        },
      );
      if (!res.ok) throw new Error(`openai-compatible ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return (json.choices?.[0]?.message?.content ?? "").trim();
    },
  };
}

const FACTORIES: Record<string, () => AiProvider | null> = {
  anthropic: anthropicProvider,
  "openai-compatible": openAiCompatibleProvider,
};

export function getProvider(): AiProvider | null {
  const preferred = process.env.AI_PROVIDER?.trim();
  if (preferred) {
    if (preferred === "none") return null;
    return FACTORIES[preferred]?.() ?? null;
  }
  for (const factory of Object.values(FACTORIES)) {
    const provider = factory();
    if (provider) return provider;
  }
  return null;
}

export function providerStatus(): { available: boolean; name: string | null } {
  const provider = getProvider();
  return { available: Boolean(provider), name: provider?.name ?? null };
}

/** Pull the first JSON object/array out of a reply that may be fenced or prosey. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
