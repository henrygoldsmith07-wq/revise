# Data Protection Impact Assessment — DRAFT

> **DRAFT — not legal advice, and not approved. Prepared for review by a
> qualified data-protection professional before any launch involving real
> users.**

This document is a working draft assembled from reading the Revise source
code. It is not a compliance artefact. It has not been reviewed by a DPO, a
solicitor, or anyone with the authority to sign it off, and it does not
establish a lawful basis for anything.

Where a fact could not be established by reading the repository, this document
says **"not established from the code"** rather than guessing. Those are not
omissions — they are the questions a reviewer needs to answer with the product
and engineering teams.

Every statement about how data flows is cross-checked against
[`docs/data-flows.md`](data-flows.md). Where the two disagree, that is a finding
to raise.

---

## Update — privacy / AI trust change set (October 2026)

Engineering status of the findings below, after the change set that added
per-learner AI consent, a single AI egress policy, account deletion, enforced
retention and per-table RLS verification. This is an engineering summary for
the reviewer, not a re-assessment; the sections below keep their original
analysis, and anything they say is unimplemented that appears in this table
as implemented should be read with this table.

| Finding | Status | Where |
|---|---|---|
| R1 / blocker 1 — no AI opt-in | **Implemented.** Off by default; explicit, versioned, revocable; enforced server-side on every `/api/ai` request from `public.ai_consent`. | `src/domain/ai-consent.ts`, `src/app/api/ai/route.ts`, Settings → AI |
| R3 / blocker 2 — unmasked DLQ retries | **Implemented.** Retries use the same transport (consent → egress policy → request); nothing is queued or retried without consent; revoking clears the queue. | `src/ai/transport.ts`, `src/ai/mark-dlq.ts` |
| R4 / blocker 2 — unmasked tasks | **Implemented for text.** All text tasks masked and minimised, in the browser and again on the server. OCR images are metadata-stripped; handwriting itself cannot be masked and is sent only with consent. | `src/ai/egress.ts`, `src/ai/task-policy.ts` |
| R2 / blocker 3 — no account deletion | **Implemented** (needs the migration and `SUPABASE_SERVICE_ROLE_KEY`). Session-verified route; auth user deleted; cascades; residue verified. | `src/app/api/account/delete/route.ts` |
| R6 — quota identifiers without FK | **Implemented.** FK with cascade; orphans removed; idle rows purged after 2 days by a secret-gated daily cron. | `supabase/migrations/20261007000100_privacy_ai_trust.sql`, `src/app/api/maintenance/retention/route.ts` |
| R7 / item 6 — RLS test | **Implemented** locally (per-table test, PGlite execution, deployed-catalog preflight). Live staging run still required. | `tests/security.test.ts`, `tests/privacy-sql.test.ts`, `scripts/staging-contract.mjs` |
| R9 — inaccurate deletion copy | **Fixed.** The disclosure distinguishes local erasure from account deletion and states AI is off by default. | `src/domain/portability.ts` |
| Item 8 — unused retention helpers | **Removed** and replaced by a retention table that names the enforcing code for each row. | `src/domain/retention-policy.ts` |
| Item 13 — log and device-local invariants | **Asserted by tests.** | `tests/security.test.ts`, `tests/ai-task-policy.test.ts` |
| Blocker 4, items 5, 7, 9–12, 14–15 | **Not addressed** — controller identity, transfers, privacy notice, parental position, consultation, telemetry decision, E2EE default, output review, sign-off. | — |

---

## 1. Scope

**Service.** Revise, a Next.js web application for UK students aged 15–18. It
provides spaced-repetition revision, AI-assisted marking, a scanned-paper (OCR)
path, a study-history connector called Pulse, and an offline-first sync replica.

**Deployment assumed for this assessment.** A hosted deployment with Supabase
configured and at least one AI provider credential set. This is the *worst*
case, not the typical case — a signed-out learner with no account has no
server-side footprint at all — and it is the case the product wants to ship.

**Version assessed.** The repository as committed. No release tag, deployment
identifier or build hash is recorded in the repository, so this assessment
cannot be pinned to a specific artefact. **Not established from the code.**

**Out of scope.** Curriculum content and question-bank authoring (static,
non-personal data); the operator tooling for question review (for example
`scripts/wjec-review.mjs`), which operates on authored content rather than
learner data.

---

## 2. Controller and processor context

### 2.1 Controller

**Not established from the code.** The repository contains no legal-entity
name, no registered address, no company number, no Data Protection Officer
contact and no privacy contact address. These must be supplied before this
assessment can be signed. They are load-bearing: the Children's code applies to
the controller, and the ICO's own contact point is the controller's, not the
hosting provider's.

### 2.2 Processors and sub-processors

| Party | Role | What they receive | Where it is decided in code |
|---|---|---|---|
| Supabase (auth, Postgres, RLS, RPCs) | Processor | All synced rows for a signed-in learner; auth session; AI quota counters | `src/data/sync.ts`, `supabase/schema.sql` |
| Vercel or equivalent Next.js host | Processor | Request/response metadata for every route; the one AI error line described below | `vercel.json`, `src/app/api/ai/route.ts` |
| Anthropic | Sub-processor | Question text plus PII-masked answers; explanations; generated content | `src/ai/provider.ts` |
| Any OpenAI-compatible endpoint (OpenRouter, Groq, Together, a self-hosted llama.cpp server, or any other) | Sub-processor | The same payloads | `src/ai/provider.ts`, `.env.example` |
| classifier.dev | Sub-processor | Question prompt, missed mark-scheme point and student answer, each truncated, already masked | `src/ai/error-classifier.ts` |
| Pulse | Separate controller, not a processor | The learner's own review log and attempt records, on request | `src/app/api/pulse/history/route.ts` |

The AI sub-processor list is **open-ended by design**. `src/ai/provider.ts`
rotates through whatever `OPENAI_COMPATIBLE_MODELS` names, up to
`OPENAI_COMPATIBLE_MAX_ROTATIONS` deep, across any base URL. A deployment
operator can add a sub-processor without a code change. The list of
sub-processors must therefore be pinned operationally, not in the repository,
and must be disclosed to learners. **Not established from the code** that any
such disclosure exists.

The two specific processing purposes with an external third party — AI
provider calls and the Pulse connector — are set out in section 3.3 because the
rest of this document treats them as ordinary app features.

### 2.3 International transfers

**Not established from the code.** No transfer mechanism (UK IDTA, UK Addendum,
EU Standard Contractual Clauses), no transfer risk assessment, and no
sub-processor location inventory exist in the repository. Given the sub-processor
list above, transfers outside the UK are the likely case rather than the edge
case. This is a blocker, not a documentation gap.

---

## 3. Description of processing

### 3.1 Data subjects

UK secondary-school students, nominally aged 15–18, who use Revise for their own
revision. No age is collected, no date of birth is collected, and no age
verification exists beyond what happens during onboarding.

No parent, guardian, teacher or school staff account exists in the shipped
product. `src/domain/teacher.ts` defines class-workflow types and says so
itself: *"the student product has no school roster or SIS connector yet"*, and
the demo cohort it works over is synthetic. The module that would persist it
(`src/data/teacher-workspace.ts`) is not imported anywhere in `src/`.

### 3.2 Data types

| Category | Examples | Where held |
|---|---|---|
| Account identifiers | Supabase auth user id, email address (shown in Settings) | Supabase auth; `user_id` on every synced table |
| Learning record | Attempts (answers, awarded/max, feedback, markedBy, confidence, escalation state, elapsed time, mode), review logs and grades, mistakes with free-text `description`, cards with authored text, question bank records | IndexedDB; Supabase replica |
| Study behaviour | Session timestamps, streak, XP, lesson progress, planned sessions, exam dates | IndexedDB; Supabase replica |
| Free text authored by the learner | Answers to practice and past-paper questions, mistake descriptions, card notes, chat turns in the Socratic task, pasted notes | IndexedDB; Supabase replica; AI provider for some tasks |
| Images | Base64 photographs of written work for the OCR task | Browser memory; AI provider |
| Derived analytics | Funnel events, product-outcome measures, grade predictions and actuals, paper outcomes, intervention outcomes | `meta` store, device only |
| Device metadata | A per-device id and label, a Lamport counter, a pull cursor per entity | `meta` store; `device_id` on learner records |
| Telemetry | 5 event names and 15 scalar fields, on a closed allowlist | Device; an external endpoint only if one is configured |

**Special category data is not expected.** There is no health, biometric,
religious, political, racial or trade-union data in the design. Free text
authored by a 15–18 year old is nonetheless capable of containing special
category data incidentally — a learner describing a disability, a faith or a
family situation in an answer — and the product has no mechanism to detect or
protect against that. That is noted as a risk, not asserted as a likelihood.

### 3.3 Purposes, and the lawful basis claimed for each

No lawful basis is asserted anywhere in the code. The candidates below are
offered for a qualified reviewer to accept or reject; several of them are
genuinely contestable and are flagged as such.

| # | Purpose | Data used | Lawful-basis candidates | Status |
|---|---|---|---|---|
| P1 | Provide the revision service — scheduling, marking, review | Attempts, review logs, cards, mistakes, settings, streak | Art. 6(1)(b) performance of a contract with the learner | Reasonable for a free, self-service app where the learner is the contracting party. **Contestable** if a school is the actual party. |
| P2 | Cross-device sync | All synced rows for a signed-in learner | Art. 6(1)(b), or Art. 6(1)(a) consent if sync is framed as optional | Depends on framing. The app works with no account, so consent is a defensible framing and a safer one. |
| P3 | AI marking, explanation, question generation, OCR | Question text, masked or unmasked answers, images, pasted prose | Art. 6(1)(b) for on-device features; **Art. 6(1)(a) consent is the only defensible basis for sending a child's content to a third-party model provider** | **Currently unimplemented.** There is no opt-in. See 4.3 below and the risk register. |
| P4 | Error classification via classifier.dev | Question prompt, mark-scheme point, masked student answer | As P3 | As P3. Masked, but still a third-party disclosure of a child's writing. |
| P5 | Pulse study-history connector | Review log and attempt records (no free text) | Art. 6(1)(a) consent | **Implemented and enforced server-side.** |
| P6 | Operational telemetry | Closed allowlist of 5 events and 15 fields | Art. 6(1)(f) legitimate interests | Off by default. Reasonable when it is off. |
| P7 | Pilot evidence export | Redacted attempts, mistakes and funnel events under a random alias | Art. 6(1)(a) consent | Implemented behind a mandatory agreement checkbox; the file is saved locally and never uploaded. |
| P8 | Product analytics (funnel, outcomes) | Local-only event log | Art. 6(1)(f) | Local only; never leaves the device. |

### 3.4 Recipients

As set out in section 2.2. Three of those recipients receive learner content:
the AI provider, classifier.dev, and (as a separate controller) Pulse. Pulse
receives structured study records and no free text.

### 3.5 Retention

| Data | Intended retention | Actually implemented? |
|---|---|---|
| IndexedDB rows | Until the learner erases them | Yes — `clearAll()` wipes all 15 stores on that device |
| Supabase replica rows | Indefinite | Yes. **No server-side deletion path exists.** |
| Deletion tombstones | Indefinite, by design, so a deleted record cannot be resurrected by another device | Yes |
| `ai_rate_quota` rows | Indefinite | Yes, and they hold a user-identifying uuid with no foreign key to `auth.users` |
| AI quota counters (`aiDlq`) | Up to 12 retry attempts, then retired; 24 h maximum backoff | Yes |
| Telemetry | Whatever the receiving endpoint does | **Not established from the code.** No endpoint, retention policy or processor agreement is defined in the repository. |
| E2EE key material | Until erased with local data | Yes |

The `shouldRetain()` / `defaultRetention()` helpers this section originally
described (an unenforced 365-day model) have been removed. The retention that
is actually enforced — learner-controlled deletion of revision data, account
deletion, a 2-day purge of idle AI quota rows, a 30-day device-local AI mark
cache, and a consent-bound AI re-grade queue — is stated row by row, with the
enforcing code, in `src/domain/retention-policy.ts`. Revision history itself is
not auto-expired.

### 3.6 Security measures actually present

- Row-level security on every user-owned table in `supabase/schema.sql`, scoped
  to `auth.uid()`; `consume_ai_quota` refuses any key that does not match the
  caller.
- Cascading delete from `auth.users` to every user-owned table — which fires
  only if something deletes the auth user, and nothing does.
- Content-Security-Policy, `frame-ancestors 'none'`, `object-src 'none'`,
  HSTS, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`
  (asserted in `tests/security.test.ts`).
- Optional AES-GCM 256 end-to-end encryption of the `data` column, key
  generated and held on-device, **off by default**.
- PII masking of answers before cloud marking, with an honest "details
  withheld" disclosure.
- A closed telemetry allowlist rebuilt key-by-key.
- Server-side, per-request enforcement of Pulse consent.
- Strict authentication and rate limiting on the AI route, failing closed in
  production when misconfigured.

---

## 4. ICO Children's code mapping

The Children's code sets out 15 standards grouped under five themes, plus a
governance and accountability section. The 15 standards are numbered below as
the ICO numbers them. For each: what the standard requires, the current
position, and whether it is met.

Honesty rule for this section: where the code does not meet a standard, it says
so. Three standards are not met, two are partially met, and the failures are
material.

### 4.1 The product

**Standard 1 — Best interests of the child.**
*Requires that services be designed with the child's interests as a primary
consideration, and that the child's welfare is the guiding factor where
interests conflict.*
Current position: **partially evidenced.** The product's own design choices
align with the child's interests — offline-first, no ads, no behavioural
targeting, no dark patterns, no streak-loss punishment, no third-party analytics
by default. There is, however, no recorded decision process, no child-rights
assessment, and no evidence that this was considered *as a children's data
question* rather than as a product question.
**Not met as a documented standard.** Nothing in the repository shows the
assessment was done.

**Standard 2 — Data protection impact assessments.**
*Requires that a DPIA be carried out before the service is launched, and
reviewed when risks change.*
Current position: **not met.** This document is that DPIA, in draft, unsigned,
and written after the code was written. It has no sign-off, no DPO review, no
version history and no approval record. The code also contains no artefact that
would let a reviewer reconstruct the risk picture — for example, the RLS test
gap in Standard 8 below means the schema's actual protection state is asserted
by a test that does not test what its name says.
**Not met.**

**Standard 3 — Age appropriate application.**
*Requires that the design, language and content suit the developmental stage of
the users.*
Current position: **partially evidenced, and unevidenced in practice.** The
audience is stated as 15–18. Accessibility features exist (large text, dyslexia
font, high contrast, reduced motion; WCAG 2.1 AA work asserted in
`tests/compliance.test.ts`). But no age range is collected, no age assurance is
performed, and no developmental-stage analysis is recorded. An 18-year-old and a
15-year-old are treated identically, and the code has no way to tell them apart.
**Partially met. Needs a recorded age-appropriate-design review.**

**Standard 4 — Transparency.**
*Requires clear, accessible privacy information, given before or at the point
data is collected, in language a child understands.*
Current position: **partially met.** There is a Settings → Privacy panel
rendering `privacyDisclosure()` from `src/domain/portability.ts`. Its claims
are largely accurate about local-only operation. Two problems: the disclosure is
not a privacy notice (it does not name a controller, a lawful basis, a
retention period, a transfer mechanism or a rights route), and its cloud branch
tells the learner that "Delete" removes their rows "locally and on next sync on
the server", which is not what the code does — the button is "Erase local data"
and it calls `clearAll()`, which touches nothing on the server. That is an
inaccuracy in the interface itself.
**Partially met, with one inaccurate statement in the UI.**

### 4.2 Safety of data

**Standard 5 — Detrimental use of data.**
*Requires that children's data is not used in ways that harm them — including
for profiling that affects them, or for addictive design.*
Current position: **met in design, with one caveat.** There is no advertising,
no sale, no behavioural ad targeting, no dark pattern, and no mechanism to
penalise a learner for disengaging. The AI is used to mark and explain, never to
rank or gate. The caveat is that `aiDiagnose`, `aiCardsFromNotes`,
`aiExtractQuestions` and `aiOcr` send a child's own writing to a third party
without masking or opt-in; that is a detriment risk rather than a dark pattern,
and is scored as such in section 6.
**Met, with a caveat on unmasked third-party disclosure.**

**Standard 6 — Policies and community standards.**
*Requires terms, policies and a complaints process, written for a child.*
Current position: **not established from the code.** No terms of service, no
acceptable use policy, no complaints or contact route exists in the repository.
Separately, there is no moderation mechanism at all, because there is no
user-to-user communication and no AI output is shown to other users.
**Not established.**

**Standard 7 — Default settings.**
*Requires that privacy-protective settings are the default, and that changing
them is easy and reversible.*
Current position: **partially met — and this is the strongest part of the
design.** Defaults are genuinely protective: no account required; sync off for
a signed-out learner; `pulseEnabled` false and enforced server-side;
telemetry endpoint unset; E2EE off but togglable; on-device marking opt-in; no
cookies, no analytics SDK. But two defaults pull the wrong way: **sync
encryption is off by default** (so a signed-in learner's answers, feedback and
free text are readable by the database by default), and **there is no AI
default at all** because no AI setting exists.
**Partially met. Enabling E2EE by default should be considered.**

**Standard 8 — Data minimisation.**
*Requires collecting only what is needed, and only what the service uses.*
Current position: **partially met.** The telemetry layer is exemplary: a closed
allowlist rebuilt key-by-key, proven at runtime by `tests/storage-quota.test.ts`.
The pilot export strips answers, marked parts, feedback and
`Mistake.description` and substitutes a random alias, proven by
`tests/pilot-claim-quality.test.ts`. Against that: the `due` and `date` index
columns are lifted out of the payload in plaintext by design even when E2EE is
on (defensible — they are scheduler bookkeeping — but a reviewer should agree),
the whole JSONB `data` blob is replicated when the alternative would be a
narrower schema, and the AI payloads carry full question objects where a
question id plus mark scheme would do.
**Partially met.**

**Standard 9 — Data sharing.**
*Requires that children's data is not shared with third parties unless
necessary, and that sharing is high privacy by default.*
Current position: **partially met.** Pulse sharing is exemplary: off by
default, enforced server-side on every request, revoking mid-pagination, proven
by `tests/api-routes-behaviour.test.ts`. Against that, there is **no consent
gate of any kind on AI provider calls**, which is the largest third-party
disclosure the product makes; the DLQ retry path sends answers **unmasked** as a
second egress route; and the sub-processor list is deployment-defined and
unbounded.
**Partially met. AI sharing is the material failure.**

**Standard 10 — Geolocation.**
*Requires that precise location is off by default, or not collected at all.*
Current position: **met.** No geolocation API is called anywhere in `src/`. No
coordinate is stored, requested or derived. The 403 response from the Pulse
route is the closest thing to location data in the system and is a server-side
denial, not a collection.
**Met.**

**Standard 11 — Parental controls.**
*Requires appropriate parental controls, proportionate to the risk, or a clear
statement of why they are unnecessary.*
Current position: **not met.** There is no parental view, no parental account,
no consent-verification flow and no mechanism for a parent or guardian to see
or control anything. No assessment of why this might be unnecessary for a
15–18 audience exists in the repository. For a service whose users include
15-year-olds, this needs a documented, reasoned position — it cannot simply be
left blank.
**Not met.**

**Standard 12 — Profiling.**
*Requires that profiling is not done by default, is explained clearly, and
carries meaningful controls.*
Current position: **met, with a note.** The scheduling engine prioritises what a
learner should revise next, using only their own history on their own device.
There is no cross-learner profiling, no behavioural segmentation, no lookalike
audience building and no sale of derived segments. The `aiRateQuota`-style
per-user counters are quota state, not profiling. The note is that the
recommendation engine is opaque to the learner and there is no explanation of
*why* a task was recommended, which the transparency expectations would
normally require.
**Met.**

**Standard 13 — Nudge techniques.**
*Requires that techniques to encourage children to provide more data, or to
weaken privacy settings, are not used.*
Current position: **met.** No such technique was found in `src/`. The pulse
toggle is a plain two-state control. The pilot export checkbox defaults to
unchecked and the button stays disabled until ticked. No streak-loss penalty,
no social comparison, no notification pressure.
**Met.**

**Standard 14 — Connected toys and devices.**
*Requires appropriate treatment of connected devices and toys.*
Current position: **met by non-applicability.** There are no connected devices
or toys. The web application runs in a browser.
**Met.**

**Standard 15 — Online tools.**
*Requires that online tools are not used to detrimentally affect a child, and
that any third-party content is appropriately controlled.*
Current position: **partially met.** AI-generated content is validated against
a structured output schema before display, so a malformed or unsafe model
reply falls back rather than rendering. Marking always resolves — every failure
path ends in the deterministic rubric fallback, never an error, never an
ungraded answer. The exposure is upstream: a third-party model generates
explanations, cards and generated questions, and generated questions are marked
`markedBy: "ai"`. The service's own quality gates in `src/domain/claim-gates.ts`
and the wording tests in `tests/pilot-claim-quality.test.ts` block unproven
claims, which is good practice and not a substitute for reviewing model output
for age-appropriateness.
**Partially met.**

### 4.3 Governance and accountability

*Requires that the controller can demonstrate compliance, has a named
responsible person, and maintains a record of processing.*

Current position: **not established from the code.** No record of processing
activities, no retention schedule, no breach-response procedure, no training
record, no privacy contact, no sub-processor register, no transfer mechanism and
no accountable owner exist in the repository. The two automated checks that
exist for privacy — the RLS assertion in `tests/security.test.ts` and the
telemetry allowlist — are sound in the former's intent but the former does not
perform the per-table check its name implies, and it omits four tables entirely.

**Where the accountability standards bite hardest:** two of the three failures
in this assessment — no AI opt-in, and no account deletion — would each have
been caught by a review that ran against the code as written rather than
against the code as described.

### 4.4 Summary of the mapping

| Standard | Position |
|---|---|
| 1. Best interests of the child | Partially evidenced, not documented |
| 2. Data protection impact assessments | **Not met** |
| 3. Age appropriate application | Partially evidenced |
| 4. Transparency | Partially met, one UI inaccuracy |
| 5. Detrimental use of data | Met, with an unmasked-disclosure caveat |
| 6. Policies and community standards | **Not established from the code** |
| 7. Default settings | Partially met (E2EE off by default; no AI default) |
| 8. Data minimisation | Partially met |
| 9. Data sharing | Partially met — **AI sharing is the material failure** |
| 10. Geolocation | Met |
| 11. Parental controls | **Not met** |
| 12. Profiling | Met |
| 13. Nudge techniques | Met |
| 14. Connected toys and devices | Met (not applicable) |
| 15. Online tools | Partially met |
| Governance and accountability | **Not established from the code** |

---

## 5. Data subject rights

### 5.1 Right of access (Art. 15)

**Partially supported.** `buildPortabilitySnapshot()` in
`src/domain/portability.ts` produces a complete, machine-readable JSON export of
the device profile — cards, cards records, questions, papers, attempts, review
logs, mistakes, planned sessions, exam dates, lesson progress, grade predictions
and actuals, paper outcomes, settings, streak — with a count field for each
series and an import path back in. The Settings UI calls it "Export portable
snapshot". That is a good access mechanism and satisfies much of Art. 15 in
practice.

It is not a complete Art. 15 response for a signed-in learner, because it reads
the local device, not the server replica. Rows that exist only on the server —
because they were written by another device, or because the local wipe happened
after they synced — are not in it. `tests/repository.test.ts` and the
`portability` work in `tests/phase6-platform.test.ts` cover the format and the
round-trip, not server completeness.

### 5.2 Right to portability (Art. 20)

**Supported locally.** The export is a single machine-readable file with
scheduling state intact, and the restore path validates it and previews the
counts before replacing the device profile. The in-app text already describes it
as "GDPR Art. 20 portable".

### 5.3 Right to erasure (Art. 17)

**Local erasure only. Server-side erasure is not implemented.**

"Erase local data" in Settings calls `clearAll()`, which clears the fifteen
IndexedDB stores on that browser profile and reloads the page. A separate
recovery flow in `src/components/StorageRecovery.tsx` calls
`deleteLocalDatabase()`, which deletes the browser database file. Both are
device-scoped. Neither notifies the server, neither enqueues a deletion, and
neither touches the Supabase replica.

A cascade exists in `supabase/schema.sql` — every user-owned table declares
`references auth.users (id) on delete cascade` — but it fires only when the auth
user is deleted, and no route, function or control in the app deletes an auth
user. A learner who erases local data and signs back in on the same device
against the same account gets their server-side history back on the next pull.

One row type has no cascade at all: `public.ai_rate_quota` is keyed by a plain
text column holding `user:<uuid>`, has no foreign key to `auth.users`, and
therefore survives account deletion holding a user-identifying identifier with
no defined deletion point.

**This is the most serious rights gap in the service.**

### 5.4 Rights not supported

| Right | Status |
|---|---|
| Rectification | Not a distinct flow. Some local records are editable; there is no route to correct a synced row. |
| Restriction | Not implemented. |
| Objection | Not implemented. In particular, there is no way to object to AI processing beyond the absence of an opt-in — which is itself the defect. |
| Data portability to another provider | Partial: the export file is machine-readable and re-importable by Revise only. No documented interop guarantee. |
| Right to withdraw consent | Only for Pulse (toggle) and the pilot export (checkbox, which does not revoke a previously exported file). |

---

## 6. Risk register

Severity and likelihood are the assessor's judgement, not measurements. No
incident data, breach history or user research exists to calibrate them.

| ID | Risk | Severity | Likelihood | Current mitigation | Residual |
|---|---|---|---|---|---|
| R1 | A learner's answers, prose and photographs are sent to a third-party AI provider with no opt-in, no age-appropriate explanation of the transfer, and no way to decline without losing the feature | **High** | **High** — this happens on the ordinary path for any deployment with a provider configured | PII masking on the marking, explanation, Socratic, diagnose-error and route-spec paths; deterministic offline fallbacks; per-user quota | **High.** Unacceptable for a service including 15-year-olds. Closes with a per-learner AI opt-in enforced server-side. |
| R2 | A learner believes they have deleted their account; the server replica, the auth user and the quota rows all remain | **High** | **Medium** — requires the learner to use the feature and to act on the belief | Local wipe exists and is clearly labelled "Erase local data"; the UI shows per-store counts before confirming | **High.** A learner in good faith has no erasure route. |
| R3 | Unmasked learner text leaves the device through the AI dead-letter queue on a background timer, with no learner present and no disclosure shown | **High** | **Medium** — requires marking failures (offline, 429, 5xx, provider outage), which are common | Retries are capped at 12 with exponential backoff and retire the item | **High.** A second, unmasked egress path that bypasses the masking applied everywhere else. |
| R4 | Three AI tasks (`aiDiagnose`, `aiExtractQuestions`, `aiCardsFromNotes`) and the OCR path send learner content with no masking at all | **High** | **Medium** — these are opt-in features but have no consent gate | None | **High.** |
| R5 | The child, or a parent or school acting for them, cannot exercise rights properly because the export reads the device rather than the server | **Medium-High** | **High** | Local export is complete for the device profile; `tests/phase6-platform.test.ts` pins the format | **Medium.** Compounded by R2. |
| R6 | `public.ai_rate_quota` holds a user-identifying uuid with no foreign key, no retention and no deletion point | **Medium** | **Low** — the value is a pseudonymous identifier, not content | RLS is enabled with no policies; only a security-definer function writes it, and it verifies the key against `auth.uid()` | **Medium.** Identifier persists indefinitely after account deletion. |
| R7 | RLS coverage is assumed by a test that does not check per table and omits four tables (`lesson_progress`, `learner_records`, `sync_tombstones`, `ai_rate_quota`) | **High** | **Low-Medium** — depends on whether the omitted tables are correctly protected | The tables' policies must be read and confirmed manually; this is **not established from the code** | **Unknown.** Resolve by reading the policies for the four omitted tables directly. |
| R8 | A learner's writing incidentally contains special category data (health, disability, faith, family situation) with no detection or protection | **High** | **Low-Medium** | Some masking of names, addresses and contact details, not of sensitive subject matter | **Medium.** Needs an explicit policy and a learner-facing warning. |
| R9 | The in-app privacy text overstates deletion: it says Delete removes rows "on next sync on the server" | **Medium** | **High** — every signed-in learner reads it if they read anything | The text is a constant in `src/domain/portability.ts` with a branch test | **Medium.** Correct the text as an immediate action, independent of R2. |
| R10 | International transfers to AI sub-processors with no mechanism, no assessment and no disclosure | **High** | **High** — likely the default case | The sub-processor base URL is deployment-chosen, so a UK-only endpoint is possible but not enforced | **High.** Blocker for launch. |
| R11 | No age assurance and no parental or guardian involvement for users who may be 15 | **Medium-High** | **Medium** | The product states its audience | **Medium-High.** Standard 11 not met. |
| R12 | Model-generated explanations and generated questions reach a minor's screen without a documented age-appropriateness review | **Medium** | **Medium** | Structured output schemas; deterministic fallbacks; claim gates blocking unproven wording | **Medium.** Needs a content review of live model output. |
| R13 | No controller identity, DPO, privacy contact, retention schedule, breach procedure or sub-processor register exists | **High** | **High** | None | **High.** Administrative, not technical, and unavoidable. |
| R14 | Shared-device exposure: the E2EE key and the full profile live in IndexedDB under a profile-scoped database name, with no passcode or second factor | **Medium** | **Medium** | Profile-scoped database naming; optional E2EE | **Medium.** Standard for a web app; should be stated plainly to learners. |
| R15 | Telemetry sent to an external endpoint with no defined processor, retention or access control | **Medium** | **Low** — the endpoint is unset by default | A closed 15-field allowlist that cannot carry content or identifiers | **Low** while the endpoint stays unset. **Rises to medium** the moment one is configured, which is a deployment decision with no code-level gate. |

---

## 7. What must happen before launch

Ordered. Items 1–4 are launch blockers.

### Blockers

1. **Implement a per-learner AI opt-in, enforced server-side.**
   `UserSettings.aiEnabled` exists and defaults to `true`; it is never read by
   any code. Make the Pulse pattern the model: default `false`, a real Settings
   control, and a server-side check on every `/api/ai` request that returns 403
   when consent is absent, disabled, or revoked — with a test that executes the
   route the way `tests/api-routes-behaviour.test.ts` executes the Pulse route.
   Until this ships, the product must not claim it has one.

2. **Close the unmasked egress paths.**
   Apply `maskPii` inside `drainDeadMarks` exactly as `src/ai/client.ts` does,
   or route the retry back through the same masked client. Apply masking, or
   obtain consent, for `aiDiagnose`, `aiExtractQuestions`, `aiCardsFromNotes` and
   `aiOcr`.

3. **Implement server-side account deletion.**
   A route that deletes the auth user (letting the existing
   `on delete cascade` do its work) and a data path for
   `public.ai_rate_quota`, which has no cascade. Add a foreign key, a deletion
   trigger, or an explicit purge. Then correct the privacy text in Settings,
   which currently describes a capability that does not exist.

4. **Establish the controller.** Legal entity name, address, DPO or privacy
   contact, and a sub-processor register with the transfer mechanism for each
   entry. Without these, items 5 and 6 cannot be completed and the service
   cannot lawfully serve children.

### Required before real users, not necessarily blocking

5. **Record a transfer mechanism and assessment** for every AI sub-processor,
   and a documented way for a deployment to be constrained to UK/EEA endpoints.
6. **Fix the RLS test so it checks what its name says.** Assert per table, and
   add `lesson_progress`, `learner_records`, `sync_tombstones` and
   `ai_rate_quota`.
7. **Write the privacy notice.** Name the controller, the lawful basis per
   purpose, the retention period per data category, the recipients, the transfer
   mechanism, and how to exercise each right. The existing Settings text is a
   summary, not a notice, and one of its statements is inaccurate.
8. **Enforce a real retention period.** `shouldRetain()` and
   `defaultRetention()` exist and are tested but are never called. Either wire
   them to a scheduled purge or delete them so the model does not read as a
   policy.
9. **Take a documented position on parental controls and age assurance** for
   the 15-year-olds in the stated audience, and record why.
10. **Consult children**, through whatever process is proportionate, and record
    what was asked and what changed as a result. This is Standard 1 and it has
    not been done.
11. **Set `NEXT_PUBLIC_OBSERVABILITY_ENDPOINT` to nothing**, and record the
    decision and the reason. If an endpoint is ever set, the receiving service
    needs its own agreement, retention policy and access controls.
12. **Consider enabling sync encryption by default**, with a clear warning that
    turning it off later leaves previously written rows readable.
13. **Add the two missing automated invariants**: that the server never logs a
    request body, and that `aiCache` and `aiDlq` are device-local and never
    synced. Both are currently true by inspection only.
14. **Review live model output** for age-appropriateness across the four
    generation surfaces.
15. **Sign this document.** With a name, a date, a version, and a review date.
    Until then it remains a draft and must not be relied on.

---

## Appendix A — what is verified, and where

| Statement | Source |
|---|---|
| Pulse consent is enforced server-side on every request | `src/app/api/pulse/history/route.ts`, `src/data/pulse-consent.ts` |
| Pulse returns 403 when consent is absent, disabled, or revoked mid-pagination | `tests/api-routes-behaviour.test.ts` |
| Telemetry has 5 events and 15 fields; out-of-contract keys are dropped at runtime | `src/lib/observability.ts`, `tests/storage-quota.test.ts` |
| The AI 500 body carries none of the thrown error | `tests/api-ai-failure.test.ts` |
| Marking masks answers with `maskPii` and discloses only for the cloud tier | `src/ai/client.ts`, `src/ai/pii.ts`, `tests/compliance.test.ts` |
| The pilot export strips answers, marked parts, feedback, mistake description and the account id | `src/domain/pilot-export.ts`, `tests/pilot-claim-quality.test.ts` |
| Funnel events are local-only | `src/state/experiments.ts`, `src/data/storage-namespace.ts` |
| The RLS test does not check per table | `tests/security.test.ts` |
| `ai_rate_quota` has no foreign key to `auth.users` | `supabase/schema.sql` |
| No account-deletion path exists | Repository-wide search for `deleteAccount`, `deleteUser`, account-deletion routes: no matches |

Full detail, including every gap, is in [`docs/data-flows.md`](data-flows.md).