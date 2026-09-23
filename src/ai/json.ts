// ---------------------------------------------------------------------------
// Shared JSON extraction for model output.
//
// Both the server provider (src/ai/provider.ts, which is `server-only`) and
// the client-side local model (src/ai/local-model.ts) parse fenced/bare JSON
// out of model text. The helper lives here so client modules can use it
// without importing the server-only provider into the browser bundle.
// ---------------------------------------------------------------------------

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
