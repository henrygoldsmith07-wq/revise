// Primitive identities shared by every bounded context.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".

export type Id = string;
/** Date-only, `YYYY-MM-DD`. Used everywhere a wall-clock day is meant. */
export type IsoDate = string;
/** Full ISO-8601 instant. Used everywhere an ordering-sensitive moment is meant. */
export type IsoInstant = string;
