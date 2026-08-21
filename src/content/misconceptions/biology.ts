import { defineMisconceptions } from "./authoring";

const SUBJECT_ID = "wjec-alevel-biology";

export const biologyMisconceptions = defineMisconceptions([
  {
    slug: "peptide-bond-r-groups",
    subjectId: SUBJECT_ID,
    topics: ["biological-molecules"],
    statement: "A peptide bond forms between the R groups of two amino acids.",
    explanation:
      "The peptide bond forms between the carboxyl group (-COOH) of one amino acid and the amine group (-NH2) of the next, releasing water. The R groups vary and are not part of the backbone bond.",
    example: "The student draws the bond joining the two side chains and labels it a peptide bond.",
    correction:
      "Draw the -C(=O)-N- linkage between the carboxyl carbon of one amino acid and the amine nitrogen of the next, with the R groups on the alpha-carbon.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "water-has-hydrogen-bonds",
    subjectId: SUBJECT_ID,
    topics: ["biological-molecules"],
    statement: "A water molecule 'has' hydrogen bonds, which is what makes it a good solvent.",
    explanation:
      "Hydrogen bonds form between water molecules, not within one. The polar O-H bonds within each molecule give it the partial charges that form hydrogen bonds with neighbours - and that polarity and cohesion underpin its solvent and thermal properties.",
    example:
      "The student writes that water's hydrogen bonds are inside each molecule, so cannot then explain how they form between molecules.",
    correction:
      "Say: water is polar (the H atoms are delta-positive and the O delta-negative), so hydrogen bonds form between neighbouring molecules, giving cohesion, high specific heat capacity and solvent power.",
    tag: "terminology",
    ao: "AO1",
  },
]);
