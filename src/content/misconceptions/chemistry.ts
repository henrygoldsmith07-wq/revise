import { defineMisconceptions } from "./authoring";

const SUBJECT_ID = "wjec-alevel-chemistry";

export const chemistryMisconceptions = defineMisconceptions([
  {
    slug: "3d-before-4s",
    subjectId: SUBJECT_ID,
    topics: ["atomic-structure"],
    statement:
      "Electron configurations are written with 3d before 4s, and transition metal ions lose their 4s electrons last.",
    explanation:
      "4s is filled before 3d but is written after it in full configurations, and it empties first when a transition metal forms a positive ion - once occupied, the 3d level drops below 4s in energy.",
    example: "For Fe3+ the student writes [Ar] 3d3 4s2, keeping the 4s electrons instead of removing them first.",
    correction:
      "Write Fe as [Ar] 4s2 3d6; on ionisation the 4s electrons are lost first, so Fe3+ is [Ar] 3d5.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "ionisation-energy-state-symbols",
    subjectId: SUBJECT_ID,
    topics: ["atomic-structure"],
    statement:
      "The first ionisation energy equation only needs the element, the electron and the ion - state symbols are optional.",
    explanation:
      "State symbols are part of the definition: the atom is gaseous and the ion formed is gaseous and singly charged. They carry a mark, and omitting them loses it.",
    example: "The student writes Na -> Na+ + e- with no (g) symbols, losing the definition marks.",
    correction:
      "Always write the full equation Na(g) -> Na+(g) + e-, with state symbols and the +1 charge.",
    tag: "other",
    ao: "AO1",
  },
]);
