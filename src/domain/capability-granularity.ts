// ---------------------------------------------------------------------------
// Capability granularity audit.
//
// A capability node should be the smallest skill that can be diagnosed cleanly.
// The demand model deliberately examines one statement at seven depths (recall,
// explanation, …, synoptic), so spanning demands is *not* a defect. A node is
// genuinely overbroad only when, within a single demand, the parts mapped to it
// require materially different reasoning — different solution paths that share
// no common operation — because then a miss on that capability cannot tell the
// tutor which skill broke.
//
// This module reports those cases for editorial splitting. It never rewrites
// ids: attempts are recorded against the existing capability, so a split must
// add a finer node as a reviewed change rather than mutate one in place.
//
// Pure and deterministic.
// ---------------------------------------------------------------------------

import { reasoningProfileOf } from "./reasoning-signature";
import type { CapabilityNode } from "./capability-graph";
import type { Id, Question } from "./types";

export interface CapabilityGranularityFinding {
  capabilityId: Id;
  topicId: Id;
  label: string;
  /** The demand whose parts diverge into unrelated reasoning. */
  demand: string;
  parts: number;
  /** Representative divergent solution paths (truncated for the report). */
  divergentPaths: string[];
  reason: string;
}

/**
 * Flag capabilities where the *calculation* parts do not share a solution path.
 * Written demands (recall/explanation) legitimately phrase the same idea many
 * ways, so their token "paths" diverge without meaning a diagnosis problem;
 * only a calculation method (the operator sequence) is a clean, comparable
 * signal of "one skill vs several". A capability whose calculation parts follow
 * mutually unrelated methods bundles distinct skills a miss cannot localise.
 */
export function auditCapabilityGranularity(
  nodes: readonly CapabilityNode[],
  questions: readonly Question[],
): CapabilityGranularityFinding[] {
  const findings: CapabilityGranularityFinding[] = [];
  for (const node of nodes) {
    const paths: string[] = [];
    for (const question of questions) {
      if (question.subjectId !== node.subjectId) continue;
      for (const part of question.parts ?? []) {
        if (!(part.capabilityIds ?? []).includes(node.id)) continue;
        const profile = reasoningProfileOf(question, part);
        if (profile.demand !== "calculation" || !profile.calculationMethod.length) continue;
        paths.push(profile.calculationMethod.join(">"));
      }
    }
    if (paths.length < 2) continue;
    let divergentPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        totalPairs++;
        if (paths[i] !== paths[j]) divergentPairs++;
      }
    }
    if (totalPairs && divergentPairs === totalPairs) {
      findings.push({
        capabilityId: node.id,
        topicId: node.topicId,
        label: node.label,
        demand: "calculation",
        parts: paths.length,
        divergentPaths: [...new Set(paths)].map((path) => path.slice(0, 80)),
        reason: `calculation parts follow ${new Set(paths).size} unrelated methods; a miss cannot localise the skill`,
      });
    }
  }
  return findings.sort((a, b) => b.parts - a.parts || a.capabilityId.localeCompare(b.capabilityId));
}
