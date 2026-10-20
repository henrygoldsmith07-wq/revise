// ---------------------------------------------------------------------------
// Bounded request-body reader.
//
// `request.text()` buffers the whole body before anyone can look at its size,
// so a cap checked afterwards is no cap at all: a client can stream as much
// as it likes, with or without a Content-Length (chunked), or with one that
// lies. This reader rejects early on a declared length that must exceed the
// cap, then decodes the stream incrementally and stops reading the moment the
// decoded text passes the cap. Memory stays bounded by the cap plus one chunk.
// ---------------------------------------------------------------------------

export type BoundedTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too-large" | "unreadable" };

/**
 * Bytes that are guaranteed to decode to more than `maxChars` UTF-16 code
 * units: every UTF-8 sequence of n bytes (n ≤ 3) is one unit and a 4-byte
 * sequence is two, so a body of more than 3 × maxChars bytes always decodes
 * to more than maxChars units. A declared length above it can be refused
 * without reading a byte.
 */
export function maxBytesForChars(maxChars: number): number {
  return maxChars * 3;
}

/** Read a request body as text, refusing anything longer than `maxChars`. */
export async function readBoundedText(request: Request, maxChars: number): Promise<BoundedTextResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null && declared.trim() !== "") {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytesForChars(maxChars)) return { ok: false, reason: "too-large" };
  }
  const body = request.body;
  if (!body) return { ok: true, text: "" };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > maxChars) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }
    }
    text += decoder.decode();
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
  return text.length > maxChars ? { ok: false, reason: "too-large" } : { ok: true, text };
}
