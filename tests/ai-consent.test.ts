import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_CONSENT_HEADER_VALUE,
  AI_CONSENT_REQUIRED_CODE,
  AI_CONSENT_UNAVAILABLE_CODE,
  AI_CONSENT_VERSION,
  aiConsentGrantedInRow,
  aiConsentGrantedInSettings,
  aiConsentSettingsPatch,
  decideAiConsent,
  reconcileAiConsent,
} from "@/domain/ai-consent";
import { defaultSettings } from "@/data/repository";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("AI consent — what counts as consent", () => {
  it("is off by default for every new profile", () => {
    const settings = defaultSettings("u");
    expect(settings.aiEnabled).toBe(false);
    expect(aiConsentGrantedInSettings(settings)).toBe(false);
  });

  it("treats the historic implicit aiEnabled: true (no recorded wording) as no consent", () => {
    expect(aiConsentGrantedInSettings({ aiEnabled: true })).toBe(false);
    expect(aiConsentGrantedInSettings({ aiEnabled: true, aiConsentVersion: "an-older-wording" })).toBe(false);
  });

  it("accepts only an explicit boolean opt-in at the current wording", () => {
    expect(aiConsentGrantedInSettings({ aiEnabled: true, aiConsentVersion: AI_CONSENT_VERSION })).toBe(true);
    for (const value of ["true", 1, null, undefined, false]) {
      expect(aiConsentGrantedInSettings({ aiEnabled: value, aiConsentVersion: AI_CONSENT_VERSION })).toBe(false);
    }
    expect(aiConsentGrantedInSettings(null)).toBe(false);
    expect(aiConsentGrantedInSettings("yes")).toBe(false);
  });

  it("records a choice with the current wording and a timestamp", () => {
    const patch = aiConsentSettingsPatch(true, new Date("2026-10-07T10:00:00.000Z"));
    expect(patch).toEqual({ aiEnabled: true, aiConsentVersion: AI_CONSENT_VERSION, aiConsentUpdatedAt: "2026-10-07T10:00:00.000Z" });
    expect(aiConsentGrantedInSettings({ ...defaultSettings("u"), ...patch })).toBe(true);
    expect(aiConsentGrantedInSettings({ ...defaultSettings("u"), ...aiConsentSettingsPatch(false) })).toBe(false);
  });

  it("reads the server row as strictly as the settings", () => {
    expect(aiConsentGrantedInRow({ enabled: true, consent_version: AI_CONSENT_VERSION })).toBe(true);
    expect(aiConsentGrantedInRow({ enabled: true, consent_version: "old" })).toBe(false);
    expect(aiConsentGrantedInRow({ enabled: "true", consent_version: AI_CONSENT_VERSION })).toBe(false);
    expect(aiConsentGrantedInRow(null)).toBe(false);
  });
});

describe("AI consent — the server decision", () => {
  it("allows an account only with a consenting row", () => {
    expect(decideAiConsent({ mode: "account", row: { enabled: true, consent_version: AI_CONSENT_VERSION }, error: null })).toEqual({ allowed: true });
    const refused = decideAiConsent({ mode: "account", row: null, error: null });
    expect(refused).toMatchObject({ allowed: false, status: 403, code: AI_CONSENT_REQUIRED_CODE });
  });

  it("fails closed when the row cannot be read", () => {
    const result = decideAiConsent({ mode: "account", row: { enabled: true, consent_version: AI_CONSENT_VERSION }, error: { message: "down" } });
    expect(result).toMatchObject({ allowed: false, status: 503, code: AI_CONSENT_UNAVAILABLE_CODE });
  });

  it("in local mode requires the exact versioned header", () => {
    expect(decideAiConsent({ mode: "local", header: AI_CONSENT_HEADER_VALUE })).toEqual({ allowed: true });
    expect(decideAiConsent({ mode: "local", header: null })).toMatchObject({ allowed: false, status: 403 });
    expect(decideAiConsent({ mode: "local", header: "granted" })).toMatchObject({ allowed: false, status: 403 });
  });
});

describe("AI consent — device/server reconciliation", () => {
  const at = (iso: string) => iso;

  it("adopts the server value when nothing is pending; a missing row means off", () => {
    expect(reconcileAiConsent({ pending: null, server: null })).toEqual({ local: false, push: null, clearPending: false });
    expect(reconcileAiConsent({ pending: null, server: { enabled: true, updatedAt: at("2026-10-07T00:00:00Z") } }).local).toBe(true);
    expect(reconcileAiConsent({ pending: null, server: { enabled: false, updatedAt: at("2026-10-07T00:00:00Z") } }).local).toBe(false);
  });

  it("pushes an offline change unless the server holds a newer decision", () => {
    const offlineRevoke = reconcileAiConsent({
      pending: { enabled: false, at: "2026-10-07T12:00:00Z" },
      server: { enabled: true, updatedAt: "2026-10-07T09:00:00Z" },
    });
    expect(offlineRevoke).toEqual({ local: false, push: false, clearPending: true });

    const supersededOptIn = reconcileAiConsent({
      pending: { enabled: true, at: "2026-10-07T09:00:00Z" },
      server: { enabled: false, updatedAt: "2026-10-07T12:00:00Z" },
    });
    expect(supersededOptIn).toEqual({ local: false, push: null, clearPending: true });
  });

  it("resolves an unorderable conflict to off", () => {
    const tie = reconcileAiConsent({
      pending: { enabled: true, at: "2026-10-07T09:00:00Z" },
      server: { enabled: false, updatedAt: "2026-10-07T09:00:00Z" },
    });
    expect(tie.local).toBe(false);
    expect(tie.push).toBeNull();
    const otherTie = reconcileAiConsent({
      pending: { enabled: false, at: "2026-10-07T09:00:00Z" },
      server: { enabled: true, updatedAt: "2026-10-07T09:00:00Z" },
    });
    expect(otherTie).toEqual({ local: false, push: false, clearPending: true });
  });

  it("creates the server row for a first opt-in made offline", () => {
    expect(reconcileAiConsent({ pending: { enabled: true, at: "2026-10-07T09:00:00Z" }, server: null })).toEqual({
      local: true,
      push: true,
      clearPending: true,
    });
  });
});

describe("AI consent — wiring", () => {
  it("normalises stored settings through the consent rule on load", () => {
    const repo = read("src/data/repository.ts");
    expect(repo).toContain("aiEnabled: aiConsentGrantedInSettings(stored)");
    expect(repo).toMatch(/aiEnabled: false,/);
  });

  it("the device gate runs before the egress policy and the request in the single transport", () => {
    const transport = read("src/ai/transport.ts");
    const gate = transport.indexOf("localAiConsentGranted()");
    const egress = transport.indexOf("prepareAiEgress(task, payload)");
    const request = transport.indexOf('fetchFn("/api/ai"');
    expect(gate).toBeGreaterThan(-1);
    expect(egress).toBeGreaterThan(gate);
    expect(request).toBeGreaterThan(egress);
  });

  it("revoking consent clears the AI re-grade queue", () => {
    const consent = read("src/ai/consent-client.ts");
    expect(consent).toMatch(/if \(!input\.enabled\) \{[\s\S]*clearDeadMarks\(\)/);
    const dlq = read("src/ai/mark-dlq.ts");
    expect(dlq).toMatch(/drainDeadMarks[\s\S]*if \(!\(await localAiConsentGranted\(\)\)\) \{\s*await clearDeadMarks\(\);/);
    expect(dlq).toMatch(/enqueueDeadMark[\s\S]*if \(!\(await localAiConsentGranted\(\)\)\) return false;/);
  });

  it("Settings offers a real, labelled toggle that records the choice server-side", () => {
    const settings = read("src/app/settings/page.tsx");
    expect(settings).toContain("recordAiConsentChoice");
    expect(settings).toContain("aria-pressed={enabled}");
    expect(settings).toContain("Off unless you switch it on");
  });
});
