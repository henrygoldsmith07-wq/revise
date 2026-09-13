import { describe, expect, it } from "vitest";
import { seedQuestionsForSubject } from "@/content";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { wjecCapabilities } from "@/content/capabilities";
import { auditPhysicsAssessmentQuality } from "@/domain/physics-assessment-quality";

describe("zz audit check", () => {
  it("keeps the Physics depth milestone above half of the specification", () => {
    const physics = seedQuestionsForSubject("wjec-alevel-physics");
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics, questions: physics, nodes: wjecCapabilities, trustedQuestion: () => false,
    });
    console.log("completeStatements:", audit.completeStatements, "of", audit.statements);
    expect(audit.completeStatements).toBeGreaterThan(audit.statements / 2);
    const depthIssues = audit.issues.filter((issue) => issue.questionId.includes("physics-depth50") && issue.kind !== "unreviewed");
    expect(depthIssues, depthIssues.map((issue) => `${issue.kind}:${issue.questionId}`).join("; ")).toEqual([]);
    for (const row of audit.capabilityCoverageByCapability) {
      if (!["phys.kinematics-dynamics.sp-01", "phys.quantum.sp-01"].includes(row.capabilityId)) continue;
      const bad = row.demands.filter((d) => !(d.complete && d.distinct)).map((d) => `${d.demand}:${d.families.length}`);
      console.log(row.capabilityId, bad.length ? `MISSING ${bad.join(",")}` : "COMPLETE");
    }
    expect(true).toBe(true);
  });
});
