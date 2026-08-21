import { defineMisconceptions } from "./authoring";

const SUBJECT_ID = "wjec-alevel-physics";

export const physicsMisconceptions = defineMisconceptions([
  {
    slug: "weight-normal-third-law",
    subjectId: SUBJECT_ID,
    topics: ["kinematics-dynamics"],
    statement:
      "A book resting on a table: its weight and the table's normal contact force are a Newton's third law pair.",
    explanation:
      "A third-law pair is the same type of force acting on different bodies (book pushes table, table pushes book). Weight (Earth pulls book) and the normal force (table pushes book) are two different forces on the same body, so they are not a pair.",
    example: "The student calls the two forces 'equal and opposite reactions', missing that both act on the book.",
    correction:
      "Name the two bodies each force acts on. Weight pairs with the book's gravitational pull on the Earth; the normal force pairs with the book's push down on the table.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "terminal-velocity-zero-force",
    subjectId: SUBJECT_ID,
    topics: ["kinematics-dynamics"],
    statement:
      "At terminal velocity the forces on a falling object become zero, so it keeps falling at constant speed.",
    explanation:
      "At terminal velocity the resultant force is zero - weight and drag balance - but each individual force still acts. Zero resultant force means no further acceleration, not that the forces have vanished.",
    example: "The student writes that drag 'disappears' at terminal velocity, when in fact drag has grown to equal weight.",
    correction:
      "State that weight and drag are equal and opposite, so the resultant force is zero and the velocity is constant.",
    tag: "conceptual",
    ao: "AO1",
  },
]);
