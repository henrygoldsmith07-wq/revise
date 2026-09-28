// ---------------------------------------------------------------------------
// The domain model. Everything here is board-, qualification- and
// subject-agnostic: WJEC A-level is seeded data, not a hard-coded assumption.
// A future board is added by dropping a new curriculum module into
// src/domain/curriculum.
//
// Split by bounded context for ownership and dependency direction; this file
// re-exports every context so existing "@/domain/types" imports keep working.
// ---------------------------------------------------------------------------

export * from "./types-base";
export * from "./types-taxonomy";
export * from "./types-curriculum";
export * from "./types-cards";
export * from "./types-questions";
export * from "./types-marking";
export * from "./types-attempts";
export * from "./types-mistakes";
export * from "./types-assessment";
export * from "./types-planning";
export * from "./types-progress";
export * from "./types-sync";
