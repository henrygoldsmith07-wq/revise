import type { CheckpointTeaching, TeachingBySpecPoint } from "./types";
import { physicsMechanicsTeaching } from "./physics-mechanics";
import { physicsMomentumFieldsThermalTeaching } from "./physics-momentum-fields-thermal";
import { physicsNuclearOptionsTeaching } from "./physics-nuclear-options";
import { physicsWavesQuantumCircuitsTeaching } from "./physics-waves-quantum-circuits";

export type { CheckpointTeaching } from "./types";

/** Authored teaching by spec-point id. Subjects without an entry show outlines. */
export const TEACHING: TeachingBySpecPoint = {
  ...physicsMechanicsTeaching,
  ...physicsWavesQuantumCircuitsTeaching,
  ...physicsMomentumFieldsThermalTeaching,
  ...physicsNuclearOptionsTeaching,
};

export function teachingFor(specPointId: string): CheckpointTeaching | undefined {
  return TEACHING[specPointId];
}
