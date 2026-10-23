import { describe, expect, it } from "vitest";
import { buildExamMissions, missionNextAction, type MissionInput } from "@/domain/exam-mission";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildMissionSession, missionStageMinutes } from "@/domain/mission-session";
import { buildPaperResult } from "@/domain/paper-result";
import { unseenSupplyByTopic } from "@/domain/supply";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { flagshipAttempt as attempt, flagshipBank, flagshipMistake as mistake } from "./helpers-recovery";

const NOW = new Date("Sun 2026-10-11 1:00 PM BST (UTC+01:00)");
const at = (iso: string) => `${iso}T09:00:00.000Z`;

function setup(bank: Question[]) {
  const m: Mistake = mistake("m1", { questionId: "q-a1", topicId: "algebra", attemptId: "src-m1", workingErrorKind: "unit-error", createdAt: at("2026-09-20") });
  const a: Attempt = attempt("src-m1", "q-a1", 0, 3, at("2026-09-20"));
  const recovery = buildMarkRecovery({ mistakes: [m], attempts: [a], questions: bank, now: NOW });
  const topics = [...new Set(bank.flatMap((q) => q.topicIds))];
  const input: MissionInput = { mistakes: [m], recovery, daysToExam: 40, unseenByTopic: {}, supplyByTopic: unseenSupplyByTopic(topics, bank, [a]), topicTitle: (id) => id };
  const [mission] = buildExamMissions(input);
  return { mission: mission!, session: { questions: bank, attempts: [a], mistakes: [m] } };
}

describe("mission stage minutes come from the real questions", () => {
  it("equals the rounded-up sum of the session's per-question minutes, not the stage constant", () => {
    const { mission, session } = setup(flagshipBank);
    const built = buildMissionSession(mission, session);
    expect(built.minutes).toBeGreaterThan(0);
    const shown = missionStageMinutes(mission, session);
    expect(shown).toBe(Math.max(3, Math.ceil(built.minutes - 1e-9)));
    expect(shown).toBe(Math.max(3, Math.ceil(built.steps.reduce((s, x) => s + x.minutes, 0) - 1e-9)));
  });

  it("changes when the questions are longer (the old constant would not)", () => {
    const longer = flagshipBank.map((q) => ({ ...q, learning: { ...(q.learning ?? {}), expectedMinutes: 20 } })) as Question[];
    const base = setup(flagshipBank);
    const long = setup(longer);
    expect(missionNextAction(base.mission).minutes).toBe(missionNextAction(long.mission).minutes);
    expect(missionStageMinutes(long.mission, long.session)).toBeGreaterThan(missionStageMinutes(base.mission, base.session));
  });

  it("falls back to the stage constant when no session can be built", () => {
    const { mission } = setup(flagshipBank);
    const n = missionStageMinutes(mission, { questions: [], attempts: [], mistakes: [] });
    expect(n).toBe(Math.max(3, Math.ceil(mission.current.minutes)));
  });

  it("paper result next step uses the session minutes when given the session input", () => {
    const { mission, session } = setup(flagshipBank);
    const recovery = { paperId: "p", title: "P", score: 1, max: 4, stage: "autopsy", stageReason: "", totals: mission.recovery, losses: [], diagnosis: {} } as never;
    const plain = buildPaperResult({ recovery, mission, now: NOW });
    const real = buildPaperResult({ recovery, mission, now: NOW, sessionInput: session });
    expect(real.next).not.toBeNull();
    expect(plain.next).not.toBeNull();
    expect(real.next!.minutes).toBe(missionStageMinutes(mission, session));
  });
});
