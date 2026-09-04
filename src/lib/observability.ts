// Privacy-safe operational telemetry. The payload is intentionally a closed
// set of counters/status fields; callers cannot accidentally send an answer,
// prompt, card body or user identifier through this API.

export type TelemetryEventName =
  | "sync.failure"
  | "sync.completed"
  | "migration.failure"
  | "ai.degraded"
  | "storage.quota";

export interface TelemetryFields {
  status?: "failed" | "partial" | "ok" | "degraded" | "warning" | "critical";
  errorClass?: string;
  entity?: string;
  task?: string;
  provider?: string | null;
  schemaVersion?: number;
  durationMs?: number;
  pushed?: number;
  pulled?: number;
  failed?: number;
  queueDepth?: number;
  attempts?: number;
  usageBytes?: number;
  quotaBytes?: number;
  percent?: number;
}

export interface TelemetryEvent {
  event: TelemetryEventName;
  at: string;
  app: "revise";
  fields: TelemetryFields;
}

const ENDPOINT = process.env.NEXT_PUBLIC_OBSERVABILITY_ENDPOINT;
const MAX_ERROR_CLASS = 80;
const MAX_TASK = 40;
const MAX_ENTITY = 40;

function finite(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeLabel(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, max);
  return clean || undefined;
}

/** Error classes are labels, never free-form exception messages. */
function safeErrorClass(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return safeLabel(value.trim().split(/[\s:]/, 1)[0], MAX_ERROR_CLASS);
}

/** Strip every field not explicitly allowed in `TelemetryFields`. */
export function safeTelemetryFields(fields: TelemetryFields): TelemetryFields {
  return {
    ...(fields.status ? { status: fields.status } : {}),
    ...(safeErrorClass(fields.errorClass) ? { errorClass: safeErrorClass(fields.errorClass) } : {}),
    ...(safeLabel(fields.entity, MAX_ENTITY) ? { entity: safeLabel(fields.entity, MAX_ENTITY) } : {}),
    ...(safeLabel(fields.task, MAX_TASK) ? { task: safeLabel(fields.task, MAX_TASK) } : {}),
    ...(fields.provider === null ? { provider: null } : safeLabel(fields.provider, MAX_TASK) ? { provider: safeLabel(fields.provider, MAX_TASK) } : {}),
    ...(finite(fields.schemaVersion, 0, 999) != null ? { schemaVersion: finite(fields.schemaVersion, 0, 999) } : {}),
    ...(finite(fields.durationMs, 0, 86_400_000) != null ? { durationMs: finite(fields.durationMs, 0, 86_400_000) } : {}),
    ...(finite(fields.pushed) != null ? { pushed: finite(fields.pushed) } : {}),
    ...(finite(fields.pulled) != null ? { pulled: finite(fields.pulled) } : {}),
    ...(finite(fields.failed) != null ? { failed: finite(fields.failed) } : {}),
    ...(finite(fields.queueDepth) != null ? { queueDepth: finite(fields.queueDepth) } : {}),
    ...(finite(fields.attempts) != null ? { attempts: finite(fields.attempts) } : {}),
    ...(finite(fields.usageBytes) != null ? { usageBytes: finite(fields.usageBytes) } : {}),
    ...(finite(fields.quotaBytes) != null ? { quotaBytes: finite(fields.quotaBytes) } : {}),
    ...(finite(fields.percent, 0, 100) != null ? { percent: finite(fields.percent, 0, 100) } : {}),
  };
}

export function buildTelemetryEvent(event: TelemetryEventName, fields: TelemetryFields = {}, at = new Date().toISOString()): TelemetryEvent {
  return { event, at, app: "revise", fields: safeTelemetryFields(fields) };
}

/**
 * Send an event without ever blocking a study action. The endpoint is opt-in;
 * in local builds the event is dispatched for tests/devtools and discarded.
 */
export function captureTelemetry(event: TelemetryEventName, fields: TelemetryFields = {}): void {
  const payload = buildTelemetryEvent(event, fields);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("revise:telemetry", { detail: payload }));
  if (!ENDPOINT) return;
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    }
  } catch {
    // Telemetry is best-effort and must never break offline revision.
  }
}

/** Server-side sink for the same redacted event contract. */
export function captureServerTelemetry(event: TelemetryEventName, fields: TelemetryFields = {}): void {
  const payload = buildTelemetryEvent(event, fields);
  if (typeof window !== "undefined") {
    captureTelemetry(event, fields);
    return;
  }
  // Structured logs are picked up by the hosting platform's log drain. The
  // allow-list above guarantees that prompts, answers and user ids cannot be
  // included even if a caller accidentally passes a wider object.
  if (process.env.NODE_ENV !== "test") console.warn("[revise.telemetry]", JSON.stringify(payload));
}

export function errorClass(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return error.name;
  return error instanceof Error ? error.name : "unknown";
}

