import { classEvidenceSnapshot } from "@/domain/class-sharing";
import type { ClassAssignment, ClassEvidence, ClassMembership } from "@/domain/classes";
import { activeDatabaseProfile, getDb } from "./db";

/** Explicit-share only: do not use the progressively hydrated UI history.
 * Nothing is sent here. The caller still chooses when to invoke the sharing RPC. */
export async function loadClassEvidenceSnapshot(member: ClassMembership, assignments: ClassAssignment[]): Promise<ClassEvidence[]> {
  if (activeDatabaseProfile() !== member.studentId) throw new Error("Account changed. Reload classes before sharing.");
  const db = await getDb();
  const tx = db.transaction(["attempts", "mistakes"], "readonly");
  const [attempts, mistakes] = await Promise.all([
    tx.objectStore("attempts").index("byUser").getAll(member.studentId),
    tx.objectStore("mistakes").index("byUser").getAll(member.studentId),
  ]);
  await tx.done;
  if (activeDatabaseProfile() !== member.studentId) throw new Error("Account changed. Reload classes before sharing.");
  return classEvidenceSnapshot(member, assignments, attempts, mistakes);
}
