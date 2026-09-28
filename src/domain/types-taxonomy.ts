// Shared taxonomies: command words and misconception tags.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".

export type CommandWord =
  | "state"
  | "describe"
  | "explain"
  | "calculate"
  | "show that"
  | "suggest"
  | "compare"
  | "evaluate"
  | "discuss"
  | "justify"
  | "deduce"
  | "predict"
  | "outline"
  | "other";

export type MisconceptionTag =
  | "units"
  | "significant-figures"
  | "rearrangement"
  | "substitution-slips"
  | "graph-reading"
  | "method-skipped"
  | "misread-command"
  | "terminology"
  | "conceptual"
  | "other";
