// Persisted generic structure-drill evidence; no imports from marking behavior.
export type TechniqueDrillId = "describe" | "explain" | "evaluate" | "six-mark";

export interface TechniqueDrillSubmission {
  id: string;
  drillId: TechniqueDrillId;
  submittedAt: string;
  /** Only shape signals: no raw response, mark or correct-answer claim. */
  detectedChecks: string[];
}
