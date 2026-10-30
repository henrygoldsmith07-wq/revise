// ---------------------------------------------------------------------------
// Shared JSON extraction for model output.
//
// Both the server provider (src/ai/provider.ts, which is `server-only`) and
// the client-side local model (src/ai/local-model.ts) parse fenced/bare JSON
// out of model text. The helper lives here so client modules can use it
// without importing the server-only provider into the browser bundle.
// ---------------------------------------------------------------------------

export function extractJson<T>(text: string): T | null {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[\[{]/);
  if (start < 0) return null;

  const opening = candidate[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, index + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
