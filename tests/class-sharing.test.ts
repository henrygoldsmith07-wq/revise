import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classEvidenceSnapshot } from "@/domain/class-sharing";
import type { ClassAssignment, ClassMembership } from "@/domain/classes";
import { attempt, mistake } from "./helpers-recovery";

const member: ClassMembership = { classId: "class-a", studentId: "u1", alias: "Pupil A", ageBand: "13-17", status: "active", consentedAt: "2026-10-11T10:00:00.000Z", authorizedAt: "2026-10-11T11:00:00.000Z" };
const assigned: ClassAssignment = { id: "a", classId: "class-a", title: "Algebra", kind: "topic", topicId: "algebra", questionIds: [], dueDate: "2026-10-20" };
const work = attempt("recent", "q-a1", 1, 3, "2026-10-12T10:00:00.000Z", { answers: { a: "Private learner answer" }, feedback: "Private feedback" });

describe("minimal opt-in class evidence", () => {
  it("does not share pending members, pre-consent work or unrelated assignments", () => {
    expect(classEvidenceSnapshot({ ...member, status: "pending" }, [assigned], [work], [])).toEqual([]);
    expect(classEvidenceSnapshot(member, [assigned], [{ ...work, createdAt: "2026-10-10T10:00:00.000Z" }], [])).toEqual([]);
    expect(classEvidenceSnapshot(member, [{ ...assigned, classId: "class-b" }], [work], [])).toEqual([]);
    expect(classEvidenceSnapshot(member, [{ ...assigned, topicId: "geometry" }], [work], [])).toEqual([]);
    expect(classEvidenceSnapshot(member, [assigned], [{ ...work, userId: "other" }], [])).toEqual([]);
    expect(classEvidenceSnapshot({ ...member, authorizedAt: null }, [assigned], [work], [])).toEqual([]);
    expect(classEvidenceSnapshot({ ...member, authorizedAt: "2026-10-13T10:00:00.000Z" }, [assigned], [work], [])).toEqual([]);
  });
  it("sends only allowlisted metadata and one dominant diagnosis per attempt", () => {
    const rows = classEvidenceSnapshot(member, [assigned], [work], [
      mistake("m1", { attemptId: work.id, marksLost: 1, misconception: "terminology" }),
      mistake("m2", { attemptId: work.id, marksLost: 2, misconception: "method-skipped" }),
    ]);
    expect(rows).toEqual([{ attemptId: "recent", studentId: "u1", questionId: "q-a1", topicId: "algebra", awarded: 1, max: 3, attemptedAt: work.createdAt, misconception: "method-skipped" }]);
    expect(JSON.stringify(rows)).not.toMatch(/Private|answers|feedback/);
  });
  it("uses exact question checks and fails closed for bad dates and marks", () => {
    const check: ClassAssignment = { ...assigned, kind: "check", topicId: null, questionIds: ["q-a1"] };
    expect(classEvidenceSnapshot(member, [check], [work], [])).toHaveLength(1);
    expect(classEvidenceSnapshot(member, [{ ...check, questionIds: ["q-a2"] }], [work], [])).toEqual([]);
    expect(classEvidenceSnapshot({ ...member, consentedAt: "bad" }, [assigned], [work], [])).toEqual([]);
    expect(classEvidenceSnapshot(member, [assigned], [{ ...work, awarded: 4 }], [])).toEqual([]);
    expect(classEvidenceSnapshot(member, [assigned], [{ ...work, awarded: Number.NaN }], [])).toEqual([]);
  });
  it("wires classes without demo seeds and retains the canonical review gate", () => {
    const page = readFileSync("src/app/classes/page.tsx", "utf8");
    expect(page).not.toContain("demoTeacher");
    expect(page).toContain("/reviewer/review/");
    expect(page).toContain("classEvidenceSnapshot");
    expect(page).toContain("Leave and delete shared evidence");
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain('if (pathname !== "/classes" && pathname !== "/settings") return <Onboarding');
  });
});
