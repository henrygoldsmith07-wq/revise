import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_TASK_POLICY } from "@/ai/task-policy";
import { AI_TASKS, RESPONSE_SCHEMAS } from "@/ai/types";
import { SYNC_TABLES } from "@/data/sync-contract";
import { COLLECTION_STORES } from "@/data/db";

describe("AI task policy — every task declares its contract", () => {
  it("covers exactly the AI tasks", () => {
    expect(Object.keys(AI_TASK_POLICY).sort()).toEqual([...AI_TASKS].sort());
  });

  it.each([...AI_TASKS])("%s requires consent, is advisory, labels its source and has a structured output", (task) => {
    const policy = AI_TASK_POLICY[task];
    expect(policy.requiresConsent).toBe(true);
    expect(policy.authoritative).toBe(false);
    expect(policy.sourceLabel.length).toBeGreaterThan(5);
    expect(policy.contextBoundary.length).toBeGreaterThan(5);
    expect(RESPONSE_SCHEMAS[task]).toBeDefined();
  });

  it("only OCR sends something that cannot be text-masked", () => {
    const images = AI_TASKS.filter((task) => AI_TASK_POLICY[task].learnerContent === "image");
    expect(images).toEqual(["ocr"]);
  });

  it("every task that reads untrusted text fences it in the prompt", () => {
    const tasks = readFileSync("src/ai/tasks.ts", "utf8");
    for (const label of ["student question", "student turn", "answer to part", "student notes", "recorded mistakes", "uploaded paper text"]) {
      expect(tasks).toContain(label);
    }
    expect(tasks).toContain("${UNTRUSTED_RULE}");
  });

  it("the marking payload is a bounded schema, not an arbitrary object", () => {
    const tasks = readFileSync("src/ai/tasks.ts", "utf8");
    expect(tasks).not.toContain("z.custom<Question>");
    expect(tasks).not.toMatch(/mistakes:\s*z\.array\(z\.any\(\)\)/);
    expect(tasks).toContain("markSchemaFor(question)");
  });
});

describe("AI caches stay on the device", () => {
  it("aiCache and aiDlq are neither synced collections nor sync tables", () => {
    expect(COLLECTION_STORES as readonly string[]).not.toContain("aiCache");
    expect(COLLECTION_STORES as readonly string[]).not.toContain("aiDlq");
    const tables = Object.values(SYNC_TABLES).join(" ");
    expect(tables).not.toMatch(/ai_?cache|ai_?dlq/i);
    expect(Object.keys(SYNC_TABLES)).not.toContain("aiCache");
    expect(Object.keys(SYNC_TABLES)).not.toContain("aiDlq");
  });

  it("nothing enqueues the AI caches for sync", () => {
    for (const file of ["src/ai/semantic-cache.ts", "src/ai/mark-dlq.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/enqueue\(\s*["']ai/);
    }
  });
});
