import type { DiagramSpec } from "@/domain/diagrams";
import type { Id, Topic } from "@/domain/types";

// ---------------------------------------------------------------------------
// Authored diagram cards.
//
// The Label a diagram mode already knows how to score a hotspot placement, but
// it is only useful when the bank contains diagram payloads. These original,
// monochrome SVGs live in /public so they work offline and stay small; the
// hotspot coordinates are percentages so the same exercise works at any size.
// A topic can have one diagram template shared by every exam-board variant.
// ---------------------------------------------------------------------------

export interface AuthoredDiagram {
  /** Stable suffix used in card ids and tags. */
  id: Id;
  front: string;
  spec: DiagramSpec;
  tags: string[];
}

const CELL: AuthoredDiagram = {
  id: "eukaryotic-cell",
  front: "Label a eukaryotic cell",
  spec: {
    imageUrl: "/diagrams/animal-cell.svg",
    hotspots: [
      { id: "membrane", x: 10, y: 50, label: "Cell surface membrane", note: "Controls what enters and leaves the cell." },
      { id: "cytoplasm", x: 49, y: 28, label: "Cytoplasm", note: "Site of many metabolic reactions." },
      { id: "nucleus", x: 33, y: 47, label: "Nucleus", note: "Contains the genetic material and controls cell activity." },
      { id: "mitochondrion", x: 60, y: 33, label: "Mitochondrion", note: "Aerobic respiration releases ATP here." },
      { id: "vacuole", x: 49, y: 73, label: "Vacuole", note: "A small storage compartment in this simplified cell." },
    ],
  },
  tags: ["diagram", "cell-structure", "organelles"],
};

const ALVEOLUS: AuthoredDiagram = {
  id: "alveolus",
  front: "Label an alveolus and its capillary",
  spec: {
    imageUrl: "/diagrams/alveolus.svg",
    hotspots: [
      { id: "alveolus", x: 34, y: 45, label: "Alveolus", note: "A large surface area is available for gas exchange." },
      { id: "capillary", x: 62, y: 25, label: "Capillary", note: "The close blood supply maintains a steep concentration gradient." },
      { id: "red-cell", x: 53, y: 40, label: "Red blood cell", note: "Haemoglobin binds oxygen as it diffuses into the blood." },
      { id: "exchange-surface", x: 47, y: 49, label: "Thin exchange surface", note: "A short diffusion distance increases the rate of gas exchange." },
    ],
  },
  tags: ["diagram", "gas-exchange", "diffusion"],
};

const CIRCUIT: AuthoredDiagram = {
  id: "series-circuit",
  front: "Label a series circuit",
  spec: {
    imageUrl: "/diagrams/series-circuit.svg",
    hotspots: [
      { id: "cell", x: 13, y: 51, label: "Cell", note: "Provides the potential difference that drives charge around the circuit." },
      { id: "switch", x: 38, y: 30, label: "Switch", note: "Opening the switch breaks the circuit." },
      { id: "resistor", x: 61, y: 22, label: "Resistor", note: "Transfers electrical energy and limits current." },
      { id: "lamp", x: 74, y: 21, label: "Lamp", note: "Transfers electrical energy mainly as light and heat." },
      { id: "ammeter", x: 46, y: 80, label: "Ammeter", note: "Must be connected in series to measure current." },
    ],
  },
  tags: ["diagram", "electric-circuits", "components"],
};

const FREE_BODY: AuthoredDiagram = {
  id: "free-body",
  front: "Label the forces on a block",
  spec: {
    imageUrl: "/diagrams/free-body.svg",
    hotspots: [
      { id: "weight", x: 48, y: 23, label: "Weight", note: "Acts vertically downwards through the centre of mass." },
      { id: "normal", x: 48, y: 81, label: "Normal reaction", note: "Acts perpendicular to the surface." },
      { id: "friction", x: 28, y: 69, label: "Friction", note: "Opposes relative motion or the tendency to move." },
      { id: "driving", x: 71, y: 43, label: "Driving force", note: "Acts up the slope in this example." },
    ],
  },
  tags: ["diagram", "kinematics-dynamics", "forces"],
};

const PROBABILITY: AuthoredDiagram = {
  id: "venn-diagram",
  front: "Label the regions of a Venn diagram",
  spec: {
    imageUrl: "/diagrams/probability-venn.svg",
    hotspots: [
      { id: "event-a", x: 34, y: 50, label: "Event A", note: "All outcomes inside the left circle belong to A." },
      { id: "intersection", x: 50, y: 50, label: "Intersection A ∩ B", note: "These outcomes are in both events." },
      { id: "event-b", x: 66, y: 50, label: "Event B", note: "All outcomes inside the right circle belong to B." },
      { id: "outside", x: 18, y: 25, label: "Outside both events", note: "These outcomes are in the sample space but not A or B." },
    ],
  },
  tags: ["diagram", "probability", "venn"],
};

const ENERGETICS: AuthoredDiagram = {
  id: "energy-profile",
  front: "Label a reaction energy profile",
  spec: {
    imageUrl: "/diagrams/energy-profile.svg",
    hotspots: [
      { id: "reactants", x: 25, y: 62, label: "Reactants", note: "The starting energy level of the reaction." },
      { id: "activation-energy", x: 51, y: 29, label: "Activation energy", note: "The energy barrier from the reactants to the peak." },
      { id: "products", x: 77, y: 62, label: "Products", note: "The final energy level; compare it with reactants for ΔH." },
      { id: "enthalpy-change", x: 83, y: 75, label: "Enthalpy change", note: "The vertical difference between reactants and products." },
    ],
  },
  tags: ["diagram", "energetics", "activation-energy"],
};

const BY_SUBJECT_AND_SLUG: Array<{ subject: string; slug: string; diagram: AuthoredDiagram }> = [
  { subject: "biology", slug: "cell-structure", diagram: CELL },
  { subject: "biology", slug: "gas-exchange", diagram: ALVEOLUS },
  { subject: "physics", slug: "electric-circuits", diagram: CIRCUIT },
  { subject: "physics", slug: "kinematics-dynamics", diagram: FREE_BODY },
  { subject: "maths", slug: "probability", diagram: PROBABILITY },
  { subject: "chemistry", slug: "energetics", diagram: ENERGETICS },
];

function topicSlug(topic: Topic): string {
  const dot = topic.id.lastIndexOf(".");
  return dot >= 0 ? topic.id.slice(dot + 1) : topic.id;
}

/** Return the authored diagram that matches a topic, if the topic demands one. */
export function diagramForTopic(topic: Topic): AuthoredDiagram | null {
  const subject = topic.subjectId.toLowerCase();
  const slug = topicSlug(topic);
  return BY_SUBJECT_AND_SLUG.find((entry) => subject.includes(entry.subject) && entry.slug === slug)?.diagram ?? null;
}

/** The supported diagram templates, useful for coverage tests and authoring tools. */
export const authoredDiagrams = [CELL, ALVEOLUS, CIRCUIT, FREE_BODY, PROBABILITY, ENERGETICS] as const;
