import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prescribeIntervention } from "@/domain/intervention-engine";
import type { TopicIntelligence } from "@/domain/learner-intelligence";
import { missionProofHref, proofHref, type MissionSession } from "@/domain/mission-session";
import { question } from "./helpers-recovery";

// Thirtieth pass. `/adaptive-session?…&proof=1` was emitted by the repair
// plan's "Proof check" step, the mission delayed-proof banner and two links on
// the marked-answer panel, but the adaptive session page never read `proof`:
// the "Proof check" ran an ordinary supported adaptive session. The real
// proof check is ProofCheckMode on /practice?proof=<topic>.

const read = (path: string) => readFileSync(path, "utf8");
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const base = {
  topicId: "wjec-phys-topic", subjectId: "wjec-alevel-physics", mastery: 0.4, recall: 0.8, application: 0.3, applicationGap: 0.5,
  retention: 0.5, uncertainty: 0.3, evidenceAttempts: 6, evidence: "some", marksLost: 4, marksRecoverable: 4,
  openMistakes: 2, recurringMistakes: 0, daysSinceSuccess: 4, daysToExam: 60, proofStatus: "awaiting-proof",
  commandWeakness: null, timingWeakness: false,
} as unknown as TopicIntelligence;

describe("proof links go to the real proof check", () => {
  it("no source emits the dead /adaptive-session proof=1 parameter", () => {
    const offenders = sourceFiles("src").filter((path) => /adaptive-session\?[^"'`\s]*proof=1/.test(read(path)));
    expect(offenders).toEqual([]);
    expect(read("src/app/adaptive-session/page.tsx")).not.toMatch(/get\("proof"\)/);
  });

  it("the repair plan's proof-check step opens ProofCheckMode for its topic", () => {
    for (const reviewedQuestions of [0, 3, undefined]) {
      const plan = prescribeIntervention(base, "Topic", reviewedQuestions === undefined ? {} : { reviewedQuestions });
      const step = plan.steps.find((s) => s.kind === "delayed-proof");
      expect(step, `delayed-proof step with reviewedQuestions=${reviewedQuestions}`).toBeDefined();
      expect(step!.href).toBe(proofHref("wjec-alevel-physics", "wjec-phys-topic"));
    }
    // ...and /practice reads that parameter into ProofCheckMode.
    const practice = read("src/app/practice/page.tsx");
    expect(practice).toContain('params.get("proof")');
    expect(practice).toMatch(/<ProofCheckMode[^>]*topicId=\{proofTopicId\}/);
  });

  it("the mission delayed-proof banner links to the step's topic, not a question id", () => {
    const qs = [question("q-1", "topic-a", { subjectId: "wjec-alevel-physics" })];
    const session = { steps: [{ kind: "delayed-proof", questionIds: ["q-1"] }] } as unknown as MissionSession;
    expect(missionProofHref(session, qs)).toBe(proofHref("wjec-alevel-physics", "topic-a"));
    expect(missionProofHref({ steps: [] }, qs)).toBeNull();
    expect(missionProofHref({ steps: [{ kind: "delayed-proof", questionIds: ["missing"] }] } as unknown as MissionSession, qs)).toBeNull();
    const mode = read("src/components/MissionSessionMode.tsx");
    expect(mode).toContain("missionProofHref(session, store.questions)");
    expect(mode).not.toContain("session.questionIds[0]");
  });

  it("the marked-answer 'Try an unseen question' link no longer logs a proof attempt", () => {
    const result = read("src/components/QuestionMarkedResult.tsx");
    expect(result).not.toMatch(/captureProductEvent\("proof\.attempted"/);
  });
});
