import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCapabilityRegistry } from "@/domain/capability-registry";
import { subjectCapabilityRegistry } from "@/content/capability-registry";
import { buildAdaptiveSession } from "@/domain/adaptive-session";
import { buildAdaptiveSession as genericPlan } from "@/domain/adaptive-plan";
import { physicsReasoningDepthQuestions } from "@/content/questions/physics-reasoning-depth";
import { allTopics } from "@/domain/curriculum";
import type { AdaptiveSessionInput } from "@/domain/adaptive-contract";
const input = (subject: string): AdaptiveSessionInput => ({topics:allTopics([subject]),cards:[],reviewLogs:[],questions:[],attempts:[],mistakes:[],mastery:[],exams:[],subjectIds:[subject],now:new Date("2026-09-30T12:00:00Z")});
describe("generic capability composition", () => {
  it("keeps registered WJEC plans equivalent to explicit graph injection", () => {
    const request = input("wjec-alevel-physics");
    request.questions = physicsReasoningDepthQuestions.slice(0,3);
    request.topicId = request.questions[0]!.topicIds[0];
    const nodes = subjectCapabilityRegistry.resolve(request.subjectIds[0]!);
    expect(nodes.length).toBeGreaterThan(0);
    expect(buildAdaptiveSession(request)?.learningPolicy).toBe("capability-evidence-v1");
    expect(buildAdaptiveSession(request)).toEqual(genericPlan({...request,capabilityNodes:nodes}));
  });
  it("degrades reference-tier subjects safely to topic evidence without claiming capabilities", () => {
    const request = input("aqa-gcse-biology");
    // Use an existing reference subject when this curriculum is extended.
    request.topics = [{id:"reference.topic",subjectId:"reference",unitId:"reference.unit",title:"Reference topic",order:1,intrinsicDifficulty:3,summary:"Topic",keyPoints:["Idea"],commonErrors:[]}];
    request.subjectIds=["reference"];
    expect(subjectCapabilityRegistry.resolve("reference")).toEqual([]);
    const plan = buildAdaptiveSession(request);
    expect(plan).toEqual(genericPlan({...request,capabilityNodes:[]}));
    expect(plan?.topicId).toBe("reference.topic");
    expect(plan?.learningPolicy).toBeUndefined();
    expect(plan?.steps.every(step => !step.capabilityId)).toBe(true);
  });
  it("rejects mixed graphs and duplicate capability registrations", () => {
    const nodes = subjectCapabilityRegistry.resolve("wjec-alevel-physics");
    expect(() => createCapabilityRegistry({wrong:nodes})).toThrow(/subject mismatch/);
    expect(() => createCapabilityRegistry({"wjec-alevel-physics":[nodes[0]!,nodes[0]!]})).toThrow(/Duplicate/);
    const registry = createCapabilityRegistry({"wjec-alevel-physics":nodes});
    registry.resolve("wjec-alevel-physics").pop();
    expect(registry.resolve("wjec-alevel-physics")).toHaveLength(nodes.length);
  });
  it("keeps the generic planner, sequence and replan independent of content datasets and state", () => {
    for (const name of ["adaptive-plan","adaptive-sequence","adaptive-replan","adaptive-contract","capability-registry"]) {
      const source = readFileSync(`src/domain/${name}.ts`,"utf8");
      const imports = [...source.matchAll(/from ["']([^"']+)["']/g)].map(match => match[1]!);
      expect(imports.some(path => ["@/content/","@/state/","@/data/","../content/","../state/","../data/","react"].some(prefix => path.startsWith(prefix)))).toBe(false);
      expect(source).not.toContain("wjecCapabilities");
    }
  });
});
