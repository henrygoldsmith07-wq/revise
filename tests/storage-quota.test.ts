import { describe, expect, it } from "vitest";
import { classifyStorageQuota, formatStorageBytes, makeStorageQuota } from "@/data/storage-quota";
import { buildTelemetryEvent, safeTelemetryFields } from "@/lib/observability";

describe("browser storage guardrails", () => {
  it("classifies watch and critical quota thresholds deterministically", () => {
    expect(classifyStorageQuota(70, 100)).toBe("ok");
    expect(classifyStorageQuota(75, 100)).toBe("watch");
    expect(classifyStorageQuota(90, 100)).toBe("critical");
    expect(classifyStorageQuota(null, 100)).toBe("unavailable");
    expect(makeStorageQuota(786_432, 1_048_576, "2026-09-04T00:00:00.000Z")).toMatchObject({
      status: "watch",
      percent: 75,
    });
  });

  it("keeps operational events free of answer content and identifiers", () => {
    const fields = safeTelemetryFields({
      status: "failed",
      errorClass: "QuotaExceededError: answer text",
      entity: "cards",
      task: "mark",
      provider: "openai",
      usageBytes: 123,
      // Deliberately pass an out-of-contract property through a cast: the
      // runtime allow-list must remain the final privacy boundary.
      ...( { answer: "student's answer", userId: "student-1" } as unknown as Record<string, unknown>),
    });
    expect(JSON.stringify(fields)).not.toContain("answer");
    expect(JSON.stringify(fields)).not.toContain("student-1");
    expect(buildTelemetryEvent("storage.quota", { status: "critical", percent: 92 }).fields.percent).toBe(92);
  });

  it("formats byte counts for the recovery UI", () => {
    expect(formatStorageBytes(null)).toBe("unknown");
    expect(formatStorageBytes(512 * 1024)).toBe("512 KB");
    expect(formatStorageBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

