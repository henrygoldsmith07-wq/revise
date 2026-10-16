import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { bindDatabaseProfile, clearAll, getDb } from "@/data/db";
import { loadClassEvidenceSnapshot } from "@/data/class-sharing";
import type { ClassAssignment, ClassMembership } from "@/domain/classes";
import { attempt, mistake } from "./helpers-recovery";

const member: ClassMembership = { classId: "class-a", studentId: "u1", alias: "Pupil", ageBand: "13-17", status: "active", consentedAt: "2026-10-11T10:00:00Z", authorizedAt: "2026-10-11T11:00:00Z" };
const assigned: ClassAssignment = { id: "a", classId: "class-a", title: "Algebra", kind: "topic", topicId: "algebra", questionIds: [], dueDate: "2026-10-20" };
beforeEach(async () => { bindDatabaseProfile("u1"); await clearAll(); });

describe("complete explicitly shared local class history", () => {
  it("reads beyond boot's 500 attempts and filters owner, consent and assignment without egress", async () => {
    const db = await getDb();
    const tx = db.transaction(["attempts", "mistakes"], "readwrite");
    await Promise.all(Array.from({ length: 510 }, (_, i) => tx.objectStore("attempts").put(attempt(`a-${i}`, "q-a1", 1, 3, "2026-10-12T10:00:00Z"))));
    await tx.objectStore("attempts").put(attempt("other-user", "q-a1", 1, 3, "2026-10-12T10:00:00Z", { userId: "someone-else" }));
    await tx.objectStore("attempts").put(attempt("old", "q-a1", 1, 3, "2026-10-10T10:00:00Z"));
    await tx.objectStore("mistakes").put(mistake("m", { attemptId: "a-0", misconception: "units", marksLost: 2 }));
    await tx.done;
    const rows = await loadClassEvidenceSnapshot(member, [assigned]);
    expect(rows).toHaveLength(510);
    expect(rows.find(row => row.attemptId === "a-0")?.misconception).toBe("units");
    expect(JSON.stringify(rows)).not.toMatch(/answers|feedback/);
    expect(await db.count("outbox")).toBe(0);
    expect(await loadClassEvidenceSnapshot({ ...member, status: "pending" }, [assigned])).toEqual([]);
  });
  it("does not read another active profile's database", async () => {
    await expect(loadClassEvidenceSnapshot({ ...member, studentId: "another-account" }, [assigned])).rejects.toThrow(/Account changed/);
  });
});
