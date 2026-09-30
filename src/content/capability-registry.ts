import { createCapabilityRegistry } from "@/domain/capability-registry";
import { wjecCapabilities } from "./capabilities";

/** Registration is editorial content, separate from the generic engine. */
export const subjectCapabilityRegistry = createCapabilityRegistry(Object.fromEntries(
  [...new Set(wjecCapabilities.map(node => node.subjectId))].map(subjectId =>
    [subjectId, wjecCapabilities.filter(node => node.subjectId === subjectId)]),
));
