import type { Question } from "@/domain/types";
import { GCSE_PHYSICS_COURSE_PREFIX } from "./questions/gcse-physics-course";

// ---------------------------------------------------------------------------
// Which GCSE questions belong on the GCSE course, and where.
//
// GCSE physics questions come from shared templates (gcse-expansion,
// data-expansion, unfamiliar-context, authentic-source, and the AQA packs),
// each applied to every board and tagged to the WJEC A-level outline the GCSE
// subjects used to build from. With a GCSE outline (DfE subject content)
// every template has to be placed again:
//   - a template on the GCSE course is retagged, part by part, to the
//     statement it tests: [topic slug, statement number];
//   - a template that is A-level material is withheld from GCSE subjects
//     (null): photon energy, the photoelectric effect, Young modulus, simple
//     harmonic motion, gravitational potential, centripetal acceleration,
//     emf and internal resistance, the pressure law from kelvin data;
//   - a template missing from the map is withheld as well, and
//     tests/gcse-question-scope.test.ts lists it, so a new template is
//     placed by a person rather than reaching GCSE students untagged.
// ---------------------------------------------------------------------------

type Tag = readonly [topic: string, statement: number];
/** One tag list per part, or one list for every part. */
type Placement = null | { tags: readonly Tag[] } | { parts: ReadonlyArray<readonly Tag[]> };

const one = (topic: string, statement: number): Placement => ({ tags: [[topic, statement]] });

export const GCSE_PHYSICS_PLACEMENT: Readonly<Record<string, Placement>> = {
  "gcse-expansion-acceleration-calculation": one("speed-acceleration", 6),
  "gcse-expansion-power-from-energy": one("energy-stores-transfers", 3),
  "gcse-expansion-elastic-extension": one("forces-interactions", 6),
  "gcse-expansion-wave-speed": one("wave-properties", 1),
  "gcse-expansion-photon-energy": null,
  "gcse-expansion-series-current": one("current-pd-resistance", 4),
  "gcse-expansion-momentum-change": one("newtons-laws-momentum", 5),
  "gcse-expansion-circular-motion-force": one("speed-acceleration", 3),
  "gcse-expansion-gravitational-field": one("forces-interactions", 2),
  "gcse-expansion-thermal-insulation": one("energy-conservation-resources", 3),
  "gcse-expansion-half-life-data": one("radioactive-decay", 4),

  "data-expansion-velocity-time-table": one("speed-acceleration", 5),
  "data-expansion-power-efficiency-data": one("energy-conservation-resources", 4),
  "data-expansion-stress-strain-data": null,
  "data-expansion-wave-speed-data": one("wave-properties", 1),
  "data-expansion-photoelectric-data": null,
  "data-expansion-iv-data": one("current-pd-resistance", 5),
  "data-expansion-collision-data": one("newtons-laws-momentum", 5),
  "data-expansion-shm-period-data": null,
  "data-expansion-gravitational-potential-data": null,
  "data-expansion-gas-pressure-data": null,
  "data-expansion-half-life-count-data": one("radioactive-decay", 3),

  "unfamiliar-context-hovercraft-launch": one("newtons-laws-momentum", 2),
  "unfamiliar-context-wave-buoy": one("energy-conservation-resources", 4),
  "unfamiliar-context-smart-polymer": null,
  "unfamiliar-context-ultrasound-image": one("wave-properties", 6),
  "unfamiliar-context-led-threshold": null,
  "unfamiliar-context-wearable-sensor": one("current-pd-resistance", 4),
  "unfamiliar-context-airbag-collision": one("stopping-road-safety", 4),
  "unfamiliar-context-space-station-rotation": null,
  "unfamiliar-context-lunar-transfer": null,
  "unfamiliar-context-insulated-cup": one("energy-conservation-resources", 3),
  "unfamiliar-context-medical-tracer": one("radioactive-decay", 4),

  "authentic-source-cyclist-field-note": one("newtons-laws-momentum", 2),
  "authentic-source-tidal-generator-report": one("energy-conservation-resources", 4),
  "authentic-source-bridge-materials-report": null,
  "authentic-source-sonar-log": one("wave-properties", 6),
  "authentic-source-photodiode-brief": null,
  "authentic-source-sensor-circuit-note": one("current-pd-resistance", 4),
  "authentic-source-crash-test-report": one("stopping-road-safety", 4),
  "authentic-source-centrifuge-log": null,
  "authentic-source-planetary-mission-report": null,
  "authentic-source-thermal-storage-log": one("energy-conservation-resources", 3),
  "authentic-source-radiotherapy-record": one("radioactive-decay", 4),

  // AQA GCSE packs (aqa-gcse.ts, aqa-gcse-practical.ts, aqa-gcse-synoptic.ts).
  kinematics: one("speed-acceleration", 6),
  "energy-efficiency": { tags: [["energy-stores-transfers", 3], ["energy-conservation-resources", 4]] },
  "hookes-law": one("forces-interactions", 6),
  "wave-equation": one("wave-properties", 1),
  "series-circuit": { tags: [["current-pd-resistance", 4], ["mains-electricity-power", 3]] },
  "half-life": one("radioactive-decay", 4),
  "practical-resistance": { parts: [[["current-pd-resistance", 2]], [["current-pd-resistance", 2]], [["current-pd-resistance", 4]]] },
  "practical-specific-heat": one("internal-energy", 3),
  "practical-hookes-law": one("forces-interactions", 6),
  "practical-ripple-tank": one("wave-properties", 3),
  "synoptic-satellite": null,
  "synoptic-medical-imaging": { parts: [[["wave-properties", 6]], [["radiation-uses-hazards", 3], ["radioactive-decay", 5]]] },
  "synoptic-battery-energy": null,
  "synoptic-crumple-zone": { parts: [[["stopping-road-safety", 4]], [["stopping-road-safety", 4], ["energy-stores-transfers", 4]]] },
};

/** The placement maps in force, by subject-id suffix. */
const PLACEMENTS: ReadonlyArray<readonly [suffix: string, map: Readonly<Record<string, Placement>>]> = [
  ["-gcse-physics", GCSE_PHYSICS_PLACEMENT],
];

/** The template a GCSE question was generated from: its id without the prefix and subject. */
export function gcseTemplateKey(question: Pick<Question, "id" | "subjectId">): string {
  return question.id.replace(/^cnt:question:/, "").replace(`${question.subjectId}-`, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The question as it belongs on its GCSE course: retagged to the GCSE
 * outline, or nothing when it is not GCSE material (or not yet placed).
 * Questions for any other subject pass through unchanged.
 */
export function scopeGcseQuestion(question: Question): Question[] {
  const map = PLACEMENTS.find(([suffix]) => question.subjectId.endsWith(suffix))?.[1];
  if (!map) return [question];
  const key = gcseTemplateKey(question);
  // Written for the GCSE outline and tagged to it already.
  if (key.startsWith(GCSE_PHYSICS_COURSE_PREFIX)) return [question];
  const placement = map[key];
  if (!placement) return [];
  const idOf = ([topic, statement]: Tag) => `${question.subjectId}.${topic}.sp-${pad(statement)}`;
  const parts = question.parts.map((part, index) => {
    const tags = "parts" in placement ? (placement.parts[index] ?? placement.parts[placement.parts.length - 1]!) : placement.tags;
    return { ...part, specPointIds: tags.map(idOf) };
  });
  const tags = "parts" in placement ? placement.parts.flat() : placement.tags;
  const specPointIds = [...new Set(tags.map(idOf))];
  const topicIds = [...new Set(tags.map(([topic]) => `${question.subjectId}.${topic}`))];
  return [{ ...question, parts, topicIds, ...(question.specPointIds ? { specPointIds } : {}) }];
}
