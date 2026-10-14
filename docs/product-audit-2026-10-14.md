# Product audit and implementation — 14 October 2026

## Product and strategy

Revise serves principally WJEC A-level learners, Physics first, with local-first
revision and optional teacher collaboration. Its intended loop is **Diagnose →
Learn/Repair → Practise → Prove → Revisit**. IndexedDB is the primary record,
Supabase an account-scoped replica, pure domain functions drive ranking and
marking, and AI is optional/consented. The existing architecture is worth keeping.

The important strength is not feature count: it is one explainable next action,
separate recall/application evidence, spaced revisiting and conservative proof
rules. Classes can make genuine teacher review a normal workflow rather than an
external editorial bottleneck. The most important weakness is **reviewed supply
and external validation**: the committed flagship ledger has no human approvals.
Generated/authored volume, generic technique signals and synthetic tests do not
establish examination correctness or learning benefit.

Reviewed surfaces included documentation/configuration, route and shell structure,
onboarding/Today, lesson and practice selection, question diagnosis/feedback,
review persistence/checkpoints, schedule/weekly planning, class adapters/UI/SQL,
reviewer trust propagation, account/consent/storage boundaries, AI task policy and
egress, offline cache/fonts, test/build/deployment configuration. This is a
source-and-targeted-execution audit, not a claim of penetration testing or live
production attestation.

## Advertised versus implemented

- Offline revision, deterministic marking, optional AI, FSRS and adaptive planning
  have real implementations; they are not a mocked chatbot or static dashboard.
- Class rosters use caller-authenticated remote records; the older synthetic
  teacher domain is not the source of the live class UI. Live Supabase rollout
  and school/guardian processes still need staging and human/legal review.
- Technique drills are generic response-shape exercises, not examiner marks.
  Practical pathways cover curriculum skills, not an official required-practical
  certification checklist. Sunday messages are opt-in/in-app, not email or push.
- The scheduler reacts to configuration changes; claiming automatic rebuilding
  on every new answer exceeded its fingerprint implementation. Copy now explains
  the explicit rebuild for new answers.
- Some specialised intervention query flags still do not enforce the named
  execution mode. They must not be treated as evidence that timed/transfer/unaided
  conditions occurred. The actual proof ledger remains the authority.
- Broad human marking accuracy, product efficacy and category leadership remain
  unproven. See [evidence operations](evidence-operations.md).

## Priority decisions

| Level | Problem | Intended outcome and verification |
| --- | --- | --- |
| A — strategic | Diagnosed answering problems led to generic practice; drills were isolated tools. | Connect actionable supported command-word/structure diagnoses to the matching drill and back to relevant enrolled practice; preserve uncertain labels, metadata-only submission, and no mastery/mark credit. Verify multipart command priority, missing content, profile scope and real browser journeys. |
| B — core reliability | An Again→Good sequence could overwrite the first CRDT operation; saves lacked activation guards; completed practice retained a Resume checkpoint. | Use current persisted card state and atomic saves, safe failure/retry UI, retained attempt history and completion checkpoint cleanup. Verify fake-IndexedDB stale-state/concurrency/failure cases and actual completion journeys. |
| B — class usability | 40-character form rejected real 64-character codes; more than 100 snapshots exceeded RPC bounds; UI history may be partial. | Accept actual codes, load complete owner-scoped persisted history at explicit sharing time, and send bounded retry-safe batches with honest partial-failure reporting. Verify 510-record local reads and 205-record batch behavior without raw-answer egress. |
| B — trust/privacy | Runtime withdrawal and offline opt-out ordering need fail-closed behavior; direct review inserts must not bypass approval requirements. | Re-derive effective approvals, make pending opt-out independent of client clock, and validate every approval at DB and consumer boundaries. Verify adversarial PostgreSQL and domain/client regressions; apply no live schema here. |
| C — route integrity | Topic-only lessons could open the remembered subject; scheduled blocks lost their scope. | Shared scoped navigation, current-query remount, encoded block identity and constrained adaptive returns. Verify multiple enrolled subjects and unsupported completion paths. |
| C — delivery | Normal production builds required Google Fonts; the injected family variable was unused by the design tokens. | Vendor licensed Inter subsets, preserve Latin Extended/Welsh glyph support, load the real CSS font family and precache it offline. Reproduce failed normal build, then pass the same command without mocks. |

These changes reinforce one loop. No new AI provider, reward system, recommendation
engine, datastore or generic analytics dashboard is introduced. Keep Today focused;
do not promote every tool into another competing primary action.

## Remaining priorities, ranked

1. Have qualified teachers independently review a small usable WJEC class pack,
   including diagnostic and genuinely different transfer questions. Measure time
   from teacher review to safe learner availability; never fabricate approval.
2. Run configured staging with real separate teacher/adult/minor accounts: grants,
   code join, authorization/revocation, explicit sharing, RLS, account deletion,
   consent propagation and the new reviewer validation migration. Complete
   retention/term-end, safeguarding and DPIA decisions before school launch.
3. Validate marks with genuine independently double-marked answers and a consented
   learner pilot; measure repair and delayed-check outcomes, not submission counts.
4. Replace or remove unsupported intervention mode flags using existing adaptive
   execution and explicit supply limits. Add a learner-visible class-assignment
   inbox without silently sharing work or replacing the primary recommender.
5. Broaden content and paid integrations only after the narrow WJEC loop has
   trusted supply and observed learner benefit.

## Verification record

The pull request records the exact final commands and results, including
before/after regressions and visible evidence. Source tests, SQL/PGlite execution,
normal production build, performance budget and real browser journeys are separate
claims; none establishes a production rollout. See the final PR description for
the checks actually completed and remaining gaps.
