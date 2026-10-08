// ---------------------------------------------------------------------------
// The only way a browser request reaches /api/ai.
//
// Both the live client (src/ai/client.ts) and the background dead-letter retry
// (src/ai/mark-dlq.ts) call `sendAiTask`. That is the guarantee behind
// "retries get identical treatment": there is no second code path that could
// skip the consent gate or the egress policy.
//
// Order of checks, cheapest and most protective first:
//   1. consent — the learner's explicit opt-in, read fresh from IndexedDB;
//   2. egress policy — masking, minimisation and image-metadata stripping;
//   3. the request itself, carrying the versioned consent header for local
//      mode (the server re-checks consent from its own record in account mode).
// ---------------------------------------------------------------------------

import { AI_CONSENT_HEADER, AI_CONSENT_HEADER_VALUE } from "@/domain/ai-consent";
import { localAiConsentGranted } from "./consent-client";
import { prepareAiEgress } from "./egress";
import type { AiTask } from "./types";

export const AI_OFF_NOTE = "AI features are off. Turn them on in Settings → AI to use them.";

export type AiTransportResult =
  | { ok: false; blocked: "consent" | "egress"; note: string }
  | { ok: true; response: Response; withheld: string | null };

export async function sendAiTask(
  task: AiTask,
  payload: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<AiTransportResult> {
  if (!(await localAiConsentGranted())) return { ok: false, blocked: "consent", note: AI_OFF_NOTE };
  const prepared = prepareAiEgress(task, payload);
  if (!prepared.ok) return { ok: false, blocked: "egress", note: prepared.reason };
  const response = await fetchFn("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", [AI_CONSENT_HEADER]: AI_CONSENT_HEADER_VALUE },
    body: JSON.stringify({ task, payload: prepared.payload }),
  });
  return { ok: true, response, withheld: prepared.withheld };
}
