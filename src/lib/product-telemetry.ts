// Privacy-safe product telemetry. Separate from operational telemetry:
// this tracks whether the revision loop works (diagnostic → repair →
// practice → proof → revisit), never what the learner wrote.
//
// Allow-list only: event name + counts/durations. No answers, prompts,
// card bodies, question text or user identifiers can pass through this API.

export type ProductEventName =
  | "diagnostic.completed"
  | "recommendation.shown"
  | "recommendation.accepted"
  | "recommendation.completed"
  | "intervention.started"
  | "intervention.completed"
  | "proof.attempted"
  | "proof.succeeded"
  | "proof.failed"
  | "mistake.repaired"
  | "session.returned"
  | "session.abandoned";

export interface ProductEventFields {
  kind?: string;
  subject?: string;
  minutes?: number;
  count?: number;
}

export interface ProductEvent {
  event: ProductEventName;
  at: string;
  app: "revise";
  fields: ProductEventFields;
}

const ENDPOINT = process.env.NEXT_PUBLIC_PRODUCT_TELEMETRY_ENDPOINT;

function safeKind(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 40);
  return clean || undefined;
}

function finite(value: unknown, max = 10_000): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function buildProductEvent(
  event: ProductEventName,
  fields: ProductEventFields = {},
  at = new Date().toISOString(),
): ProductEvent {
  const kind = safeKind(fields.kind);
  const subject = safeKind(fields.subject);
  const minutes = finite(fields.minutes, 600);
  const count = finite(fields.count, 10_000);
  return {
    event,
    at,
    app: "revise",
    fields: {
      ...(kind ? { kind } : {}),
      ...(subject ? { subject } : {}),
      ...(minutes != null ? { minutes } : {}),
      ...(count != null ? { count } : {}),
    },
  };
}

/**
 * Best-effort, never blocking. In local builds the event is dispatched for
 * devtools/tests and discarded; with an endpoint configured it is beamed.
 */
export function captureProductEvent(
  event: ProductEventName,
  fields: ProductEventFields = {},
): void {
  const payload = buildProductEvent(event, fields);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("revise:product", { detail: payload }));
  if (!ENDPOINT) return;
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Telemetry must never break offline revision.
  }
}
