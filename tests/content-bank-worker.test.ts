import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedQuestions } from "@/content";
import { isBankMessage } from "@/data/content-bank-protocol";

// Nineteenth pass: the authored bank is built in a dedicated worker and posted
// back to the main thread once, so building it no longer blocks a fresh
// profile's taps during onboarding. These pin
// that (1) the questions survive structured clone exactly, so the worker path
// serves the same bank the main-thread import did, (2) the worker entry really
// builds and posts the bank, and (3) every way the worker can fail falls back
// to the main-thread import instead of leaving the student without questions.

type Handler = ((event: unknown) => void) | null;

class FakeWorker {
  static instances: FakeWorker[] = [];
  static behaviour: "answer" | "error-event" | "error-message" | "garbage" | "silent" = "answer";
  onmessage: Handler = null;
  onmessageerror: Handler = null;
  onerror: Handler = null;
  terminated = false;
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
    const behaviour = FakeWorker.behaviour;
    setTimeout(() => {
      if (this.terminated) return;
      if (behaviour === "answer") this.onmessage?.({ data: structuredClone({ type: "bank", questions: seedQuestions }) });
      if (behaviour === "error-message") this.onmessage?.({ data: { type: "error", message: "boom" } });
      if (behaviour === "garbage") this.onmessage?.({ data: { type: "bank", questions: "nope" } });
      if (behaviour === "error-event") this.onerror?.({ preventDefault() {} });
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}

async function freshLoader() {
  vi.resetModules();
  // The real bank, already built once above: re-evaluating it per test would cost seconds each.
  vi.doMock("@/content", () => ({ seedQuestions }));
  return import("@/data/authored-questions");
}

describe("content-bank worker", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    FakeWorker.behaviour = "answer";
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("the whole bank survives structured clone unchanged", () => {
    const copy = structuredClone(seedQuestions);
    expect(copy).toHaveLength(seedQuestions.length);
    expect(copy).toEqual(seedQuestions);
  }, 60_000);

  it("the worker entry builds the bank and posts it once", async () => {
    const posted: unknown[] = [];
    vi.stubGlobal("self", { postMessage: (message: unknown) => posted.push(message) });
    vi.resetModules();
    vi.doUnmock("@/content");
    await import("@/worker/content-bank.worker");
    expect(posted).toHaveLength(1);
    const message = posted[0];
    expect(isBankMessage(message)).toBe(true);
    expect((message as { questions: unknown[] }).questions.length).toBe(seedQuestions.length);
  }, 60_000);

  it("serves the bank the worker posts, identical to the main-thread bank, and stops the worker", async () => {
    const loader = await freshLoader();
    loader.startAuthoredQuestionsInWorker();
    const questions = await loader.loadAuthoredQuestions();
    expect(loader.authoredBankSource()).toBe("worker");
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0]!;
    expect(worker.url.pathname.endsWith("/src/worker/content-bank.worker.ts")).toBe(true);
    expect(worker.options.type).toBe("module");
    expect(worker.terminated).toBe(true);
    expect(questions).toEqual(seedQuestions);
    // One request per page: later calls reuse the same promise, no second worker.
    await loader.loadAuthoredQuestions();
    expect(FakeWorker.instances).toHaveLength(1);
  }, 60_000);

  it.each(["error-event", "error-message", "garbage"] as const)("falls back to the main thread when the worker fails (%s)", async (behaviour) => {
    FakeWorker.behaviour = behaviour;
    const loader = await freshLoader();
    loader.startAuthoredQuestionsInWorker();
    const questions = await loader.loadAuthoredQuestions();
    expect(loader.authoredBankSource()).toBe("main-thread");
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    expect(questions.length).toBe(seedQuestions.length);
    expect(questions.map((q) => q.id)).toEqual(seedQuestions.map((q) => q.id));
  }, 60_000);

  it("falls back to the main thread when the worker cannot be constructed", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("blocked");
        }
      },
    );
    const loader = await freshLoader();
    loader.startAuthoredQuestionsInWorker();
    await loader.loadAuthoredQuestions();
    expect(loader.authoredBankSource()).toBe("main-thread");
  }, 60_000);

  it("falls back to the main thread when the worker never answers", async () => {
    FakeWorker.behaviour = "silent";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const loader = await freshLoader();
    loader.startAuthoredQuestionsInWorker();
    const pending = loader.loadAuthoredQuestions();
    await vi.advanceTimersByTimeAsync(loader.BANK_WORKER_TIMEOUT_MS + 1);
    vi.useRealTimers();
    const questions = await pending;
    expect(loader.authoredBankSource()).toBe("main-thread");
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    expect(questions.length).toBe(seedQuestions.length);
  }, 60_000);

  it("without Worker support (server render, old browsers) it imports on the main thread", async () => {
    vi.unstubAllGlobals();
    const loader = await freshLoader();
    loader.startAuthoredQuestionsInWorker();
    await loader.loadAuthoredQuestions();
    expect(loader.authoredBankSource()).toBe("main-thread");
  }, 60_000);

  it("a returning visit whose main-thread import fails (offline, only the worker's chunks cached) gets the bank from the worker", async () => {
    vi.resetModules();
    vi.doMock("@/content", () => {
      throw new Error("chunk not downloaded");
    });
    const loader = await import("@/data/authored-questions");
    const questions = await loader.loadAuthoredQuestions();
    expect(loader.authoredBankSource()).toBe("worker");
    expect(FakeWorker.instances).toHaveLength(1);
    expect(questions).toEqual(seedQuestions);
  }, 60_000);

  it("a returning visit whose main-thread import and worker both fail reports the bank unavailable", async () => {
    FakeWorker.behaviour = "error-event";
    vi.resetModules();
    vi.doMock("@/content", () => {
      throw new Error("chunk not downloaded");
    });
    const loader = await import("@/data/authored-questions");
    await expect(loader.loadAuthoredQuestions()).rejects.toBeInstanceOf(loader.ContentBankUnavailableError);
  }, 60_000);

  it("a returning visit (no fresh-profile start) imports on the main thread and starts no worker", async () => {
    const loader = await freshLoader();
    await loader.loadAuthoredQuestions();
    expect(loader.authoredBankSource()).toBe("main-thread");
    expect(FakeWorker.instances).toHaveLength(0);
    // A later start shares the request already made: still no worker.
    loader.startAuthoredQuestionsInWorker();
    await loader.loadAuthoredQuestions();
    expect(FakeWorker.instances).toHaveLength(0);
  }, 60_000);
});
