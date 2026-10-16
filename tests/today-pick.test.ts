import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { todayPick } from "@/domain/today-pick";
import type { AdaptiveSessionPlan } from "@/domain/adaptive-contract";
import type { RevisionAction } from "@/domain/revision-engine";

const action = (href: string, extra: Partial<RevisionAction> = {}) =>
  ({ title: "Win back 3 marks on Kinematics", subjectId: "wjec-alevel-physics", topicIds: ["wjec-alevel-physics.kinematics-dynamics"], minutes: 12, route: { href, label: "Start" }, ...extra }) as RevisionAction;
const session = (startHref: string) =>
  ({ subjectId: "wjec-alevel-maths", topicId: "wjec-alevel-maths.differentiation", topicTitle: "Differentiation", totalMinutes: 20, startHref }) as AdaptiveSessionPlan;

describe("todayPick: the one recommendation Today shows", () => {
  it("leads with the ranked plan when its top action is not the adaptive session", () => {
    const pick = todayPick(action("/practice?mission=m1"), session("/adaptive-session?start=1"));
    expect(pick).toMatchObject({ source: "plan", href: "/practice?mission=m1", topicIds: ["wjec-alevel-physics.kinematics-dynamics"], minutes: 12 });
  });
  it("leads with the adaptive session when the plan's top action is that session, or there is none", () => {
    expect(todayPick(action("/adaptive-session?start=1"), session("/adaptive-session?start=1"))).toMatchObject({ source: "adaptive", topicIds: ["wjec-alevel-maths.differentiation"], minutes: 20 });
    expect(todayPick(null, session("/adaptive-session?start=1"))?.source).toBe("adaptive");
  });
  it("uses the plan when there is no adaptive session, and is null with neither", () => {
    expect(todayPick(action("/review"), null)?.source).toBe("plan");
    expect(todayPick(null, null)).toBeNull();
  });
  it("Today and Schedule both read it, so they cannot name different next steps", () => {
    const today = readFileSync("src/app/page.tsx", "utf8");
    const schedule = readFileSync("src/app/schedule/page.tsx", "utf8");
    expect(today).toContain("todayPick(plan.top, adaptiveSession)");
    expect(schedule).toContain("todayPick(plan.top, store.adaptiveSession)");
    expect(schedule).toContain("useRevisionPlan()");
    // A session in progress leads Today (ResumeRevisionCard), so it leads Schedule too.
    expect(schedule).toContain("store.revisionCheckpoint");
  });
});
