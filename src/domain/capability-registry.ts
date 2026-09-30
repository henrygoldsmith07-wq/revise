import type { CapabilityNode } from "./capability-graph";

/** Explicit subject registration. An absent graph means topic-level evidence,
 * never fabricated capability coverage. No qualification data lives here. */
export function createCapabilityRegistry(graphs: Readonly<Record<string, readonly CapabilityNode[]>>) {
  const registered = new Map<string, CapabilityNode[]>();
  for (const [subjectId, nodes] of Object.entries(graphs)) {
    if (nodes.some(node => node.subjectId !== subjectId)) throw new Error("Capability graph subject mismatch.");
    if (new Set(nodes.map(node => node.id)).size !== nodes.length) throw new Error("Duplicate capability registration.");
    registered.set(subjectId, structuredClone([...nodes]));
  }
  return {
    resolve: (subjectId: string): CapabilityNode[] => structuredClone(structuredClone(registered.get(subjectId) ?? [])),
    resolveMany: (subjectIds: readonly string[]): CapabilityNode[] => [...new Set(subjectIds)].flatMap(subjectId => structuredClone(registered.get(subjectId) ?? [])),
  };
}
