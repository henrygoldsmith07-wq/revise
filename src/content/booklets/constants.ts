// Physical constants for the reference sheet. Every value is a published
// CODATA 2018 value (the 2019 SI redefinition made h, e, k, N_A exact).
// Source: https://physics.nist.gov/cuu/Constants/. WJEC's own Data Booklet is
// the authority in the real exam and may round differently; this sheet says so.
export interface BookletConstant {
  id: string;
  name: string;
  symbol: string;
  value: string;
  unit: string;
}

export const BOOKLET_SOURCE_URL = "https://physics.nist.gov/cuu/Constants/";
export const BOOKLET_SOURCE_NOTE =
  "CODATA 2018 values from NIST. Your real paper comes with WJEC's own Data Booklet, which may round these differently: check it before the exam.";

const c = (id: string, name: string, symbol: string, value: string, unit: string): BookletConstant => ({ id, name, symbol, value, unit });

export const CONSTANTS: Record<string, BookletConstant> = {
  c: c("c", "Speed of light in a vacuum", "c", "2.99792458 × 10^8", "m s^-1"),
  e: c("e", "Elementary charge", "e", "1.602176634 × 10^-19", "C"),
  h: c("h", "Planck constant", "h", "6.62607015 × 10^-34", "J s"),
  kB: c("kB", "Boltzmann constant", "k", "1.380649 × 10^-23", "J K^-1"),
  NA: c("NA", "Avogadro constant", "N_A", "6.02214076 × 10^23", "mol^-1"),
  R: c("R", "Molar gas constant", "R", "8.314462618", "J K^-1 mol^-1"),
  G: c("G", "Gravitational constant", "G", "6.67430 × 10^-11", "N m^2 kg^-2"),
  eps0: c("eps0", "Permittivity of free space", "ε0", "8.8541878128 × 10^-12", "F m^-1"),
  me: c("me", "Electron mass", "m_e", "9.1093837015 × 10^-31", "kg"),
  mp: c("mp", "Proton mass", "m_p", "1.67262192369 × 10^-27", "kg"),
  mn: c("mn", "Neutron mass", "m_n", "1.67492749804 × 10^-27", "kg"),
  u: c("u", "Unified atomic mass unit", "u", "1.66053906660 × 10^-27", "kg"),
  F: c("F", "Faraday constant", "F", "96485.33212", "C mol^-1"),
};

const PHYSICS = ["c", "e", "h", "kB", "NA", "R", "G", "eps0", "me", "mp", "mn", "u"];
const CHEMISTRY = ["R", "NA", "F", "e", "h", "c", "kB", "me", "mp", "mn", "u"];

const BY_SUBJECT: Record<string, { title: string; ids: string[] }> = {
  "wjec-alevel-physics": { title: "Physics constants", ids: PHYSICS },
  "wjec-alevel-chemistry": { title: "Chemistry constants", ids: CHEMISTRY },
};

export interface ConstantsSheet {
  title: string;
  constants: BookletConstant[];
}

/** The constants sheet for a subject, or null when the app has none (Maths, Biology). */
export function constantsSheetFor(subjectId: string): ConstantsSheet | null {
  const entry = BY_SUBJECT[subjectId];
  if (!entry) return null;
  return { title: entry.title, constants: entry.ids.map((id) => CONSTANTS[id]) };
}
