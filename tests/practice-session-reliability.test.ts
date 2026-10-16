import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Attempt } from "@/domain/types";
import { initialPracticeSubject, practiceSessionSummary, recordPracticeAttempt } from "@/domain/practice-session";

const source = readFileSync("src/app/practice/page.tsx", "utf8");
const attempt = (id: string, questionId = "q1", awarded = 1): Attempt => ({
  id, questionId, awarded, max: 4, userId: "u", subjectId: "biology", topicIds: ["cells"],
  answers: {}, marked: [], feedback: "", markedBy: "rubric", elapsedMs: 1000,
  mode: "practice", createdAt: "2026-10-14T10:00:00.000Z",
});

// Execute the production handler in its real closure, without rendering the
// bank-heavy route. Spies model only the IndexedDB-facing store boundary.
function completionHarness(
  sessionId: string | null,
  completeSession = vi.fn(async () => {}),
  clearRevisionCheckpoint = vi.fn(async () => {}),
) {
  const body = source.match(/  async function finishSession\(\) \{([\s\S]*?)\n  \}\n\n  const /)?.[1];
  if (!body) throw new Error("Practice completion handler not found");
  const create = new Function("store", "sessionId", "clearRevisionCheckpoint", `
    const sessionAttempts = [{ id: 'a1' }];
    const closing = { current: false };
    const completedPlanRef = { current: null };
    let finishing = false, closed = false, finishError = null, elapsedMs = 0;
    const sessionStartedAt = Date.now();
    const setFinishing = value => { finishing = value; };
    const setClosed = value => { closed = value; };
    const setFinishError = value => { finishError = value; };
    const setSessionElapsedMs = value => { elapsedMs = value; };
    return { finish: async () => { ${body} },
      state: () => ({ finishing, closed, finishError, closing: closing.current, elapsedMs, sessionAttempts }) };
  `) as (store: { completeSession: typeof completeSession }, id: string | null, clear: typeof clearRevisionCheckpoint) => {
    finish: () => Promise<void>;
    state: () => { finishing: boolean; closed: boolean; finishError: string | null; closing: boolean; elapsedMs: number; sessionAttempts: { id: string }[] };
  };
  return { ...create({ completeSession }, sessionId, clearRevisionCheckpoint), completeSession, clearRevisionCheckpoint };
}

function appendFromPage(previous: Attempt[], next: Attempt): Attempt[] {
  const callback = source.match(/setSessionAttempts\(\(previous\) => ([\s\S]*?)\);\n\s+setQuestionDrafts/)?.[1];
  if (!callback) throw new Error("Practice attempt callback not found");
  return new Function("previous", "attempt", "recordPracticeAttempt", `return (${callback});`)(previous, next, recordPracticeAttempt) as Attempt[];
}

describe("practice session reliability", () => {
  it("clears the resume point only after a planned session has been saved", async () => {
    let resolve!: () => void;
    const saving = new Promise<void>((done) => { resolve = done; });
    const h = completionHarness("planned", vi.fn(() => saving));
    const finishing = h.finish();
    expect(h.clearRevisionCheckpoint).not.toHaveBeenCalled();
    expect(h.state().closed).toBe(false);
    resolve();
    await finishing;
    expect(h.completeSession).toHaveBeenCalledWith("planned");
    expect(h.clearRevisionCheckpoint).toHaveBeenCalledOnce();
    expect(h.state().closed).toBe(true);
  });

  it("clears the resume point for standalone practice too", async () => {
    const h = completionHarness(null);
    await h.finish();
    expect(h.completeSession).not.toHaveBeenCalled();
    expect(h.clearRevisionCheckpoint).toHaveBeenCalledOnce();
    expect(h.state().closed).toBe(true);
  });

  it("keeps work on a failed planned save and allows the same finish to be retried", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValue(undefined);
    const h = completionHarness("planned", save);
    await expect(h.finish()).resolves.toBeUndefined();
    expect(h.state()).toMatchObject({ closed: false, finishing: false, closing: false });
    expect(h.state().finishError).toMatch(/retry|again/i);
    expect(h.state().sessionAttempts).toEqual([{ id: "a1" }]);
    expect(h.clearRevisionCheckpoint).not.toHaveBeenCalled();
    await h.finish();
    expect(save).toHaveBeenCalledTimes(2);
    expect(h.state().closed).toBe(true);
  });

  it.each([
    ["topic-only", null, "biology"],
    ["explicit question", "biology", null],
  ])("resolves the enrolled subject of a %s deep link before the first enrollment", (_kind, questionSubjectId, topicSubjectId) => {
    const expression = source.match(/const \[subjectId, setSubjectId\] = useState\(([\s\S]*?)\);/)?.[1];
    if (!expression) throw new Error("Initial practice subject not found");
    const subjects = [{ id: "maths" }, { id: "biology" }];
    const store = { questions: questionSubjectId ? [{ id: "q1", subjectId: questionSubjectId }] : [] };
    const getTopic = () => topicSubjectId ? { subjectId: topicSubjectId } : undefined;
    const resolve = new Function("subjectParam", "farTransferRetest", "subjects", "store", "requestedQuestionParam", "topicParam", "getTopic", "initialPracticeSubject", `return (${expression})();`);
    expect(resolve(null, undefined, subjects, store, "q1", "topic", getTopic, initialPracticeSubject)).toBe("biology");
  });

  it("keeps the checkpoint and unlocks if clearing it fails", async () => {
    const clear = vi.fn().mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValue(undefined);
    const h = completionHarness(null, vi.fn(async () => {}), clear);
    await h.finish();
    expect(h.state()).toMatchObject({ closed: false, finishing: false, closing: false });
    expect(h.state().finishError).toMatch(/again/i);
    await h.finish();
    expect(h.state()).toMatchObject({ closed: true, finishError: null });
  });

  it("does not complete the plan twice when only checkpoint clearing needs a retry", async () => {
    const clear = vi.fn().mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValue(undefined);
    const h = completionHarness("planned", vi.fn(async () => {}), clear);
    await h.finish();
    expect(h.state().closed).toBe(false);
    await h.finish();
    expect(h.state().closed).toBe(true);
    expect(h.completeSession).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("ignores overlapping finish requests while saving", async () => {
    let resolve!: () => void;
    const save = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const h = completionHarness("planned", save);
    const first = h.finish();
    await h.finish();
    expect(save).toHaveBeenCalledOnce();
    expect(h.state().finishing).toBe(true);
    resolve();
    await first;
    expect(h.clearRevisionCheckpoint).toHaveBeenCalledOnce();
  });

  it("leaves the checkpoint active when a retest answer resolves its mistake", () => {
    expect(source).not.toMatch(/if \(retestMistake\?\.resolved\)\s*\{\s*void clearRevisionCheckpoint\(\)/);
    expect(source).toContain('role="alert"');
    expect(source).toContain("Retry finishing session");
  });

  it("does not widen enrollment when links name an unenrolled subject", () => {
    const enrolledSubjectIds = ["maths"];
    expect(initialPracticeSubject({ enrolledSubjectIds, subjectParam: "chemistry", questionSubjectId: "biology", topicSubjectId: "physics" })).toBe("maths");
    expect(enrolledSubjectIds).toEqual(["maths"]);
    expect(initialPracticeSubject({ enrolledSubjectIds: [] })).toBe("");
  });

  it("uses a valid explicit enrolled subject and falls back to enrolled retest subject", () => {
    expect(initialPracticeSubject({ enrolledSubjectIds: ["maths", "biology"], subjectParam: "maths", topicSubjectId: "biology" })).toBe("maths");
    expect(initialPracticeSubject({ enrolledSubjectIds: ["maths", "biology"], retestSubjectId: "biology" })).toBe("biology");
  });

  it("uses the latest score per question but counts every genuine retry", () => {
    const history = [attempt("a1"), attempt("a2", "q1", 4), attempt("a3", "q2", 2)];
    const summary = practiceSessionSummary(history, ["q1", "q2"]);
    expect(summary).toMatchObject({ awarded: 6, available: 8, attempted: 2, retryCount: 1, answered: [true, true] });
    expect(summary.latestByQuestion.get("q1")?.id).toBe("a2");
    expect(history).toHaveLength(3);
    expect(source).toContain("attempted: summary.attempted");
    expect(source).toContain("Latest attempt:");
  });

  it("does not let duplicate callbacks inflate retry counts or progress", () => {
    const summary = practiceSessionSummary([attempt("a1"), attempt("a1"), attempt("a2", "q1", 4)], ["q1"]);
    expect(summary).toMatchObject({ attempted: 1, available: 4, awarded: 4, retryCount: 1 });
  });

  it("only scores questions in the current queue after a same-page retarget", () => {
    const summary = practiceSessionSummary([attempt("a1"), attempt("a2", "q2", 4)], ["q2", "q3"]);
    expect(summary).toMatchObject({ attempted: 1, available: 4, awarded: 4, answered: [true, false] });
  });

  it("retains distinct attempts of the same question instead of replacing history", () => {
    expect(appendFromPage([attempt("a1")], attempt("a2"))).toEqual([attempt("a1"), attempt("a2")]);
  });

  it("does not count a repeated callback for the same attempt as another attempt", () => {
    expect(appendFromPage([attempt("a1")], attempt("a1"))).toEqual([attempt("a1")]);
  });
});
