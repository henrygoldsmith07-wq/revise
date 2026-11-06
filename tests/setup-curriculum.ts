import { loadAllSubjects } from "@/domain/curriculum";

// Reference subjects' topic trees load on demand in the app (ensureSubjects in
// src/domain/curriculum/registry.ts). Suites check content across every
// subject, often at import time, so the whole curriculum is loaded before any
// test file runs. tests/lazy-curriculum.test.ts covers the on-demand path.
await loadAllSubjects();
