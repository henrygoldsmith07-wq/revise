# Trusted-question review workflow

Revise proves an improvement only on questions that a qualified human has
reviewed, and only when those questions are genuinely different from ones the
learner has already answered. This document is the contract for getting a
flagship question from authored to trusted. Nothing here approves content
automatically; the tools validate, order and record human decisions.

## States

```
unverified ──approve──▶ checked ──approve (different reviewer)──▶ verified (trusted)
     ▲                      │
     └── reject / revise ───┘   (any reject/revise resets approvals on that content)
```

- **unverified** – no valid approval for the question's current content.
- **checked** – one qualified reviewer approved all six checks (question,
  marking, worked solution, capability mapping, specification mapping, exam
  realism). Not trusted yet.
- **verified** – a second, different reviewer approved the same content. Only
  now does `promote` write a ledger entry, which is the only thing that makes
  the question trusted at runtime (`trustedAssessmentContent`).

`REQUIRED_INDEPENDENT_APPROVALS` (in `src/domain/review-workflow.ts`) is the single
policy constant. Changing a question's text, mark scheme, worked answer, marks,
specification links or provenance changes its content fingerprint
(`wjec-review-v3:sha256`), which drops it back to *needs re-review*; old
approvals stay in the log as history and never apply to the new content.

## Files

| File | Purpose |
|---|---|
| `src/content/reviews/wjec-review-audit-log.json` | Append-only, hash-chained log of every decision (reviewer, role, qualification, date, six checks, comments, classification). Editing or deleting history breaks the chain and fails `wjec:review:gates`. |
| `src/content/reviews/wjec-human-verification.json` | The ledger bundled into the app. Written only by `wjec:review:promote` from a verified chain. |
| `public.review_audit_events` (Supabase) | The **runtime continuation of the same audit log**, written by the reviewer portal. Same event objects, same hash, chained onto the committed tail. Insert-only. |
| `public.reviewer_roles` (Supabase) | Who may review, with the role and qualification stamped on their decisions. Granted only by the service role. |

## Reviewer portal (the canonical path)

Teachers review in the browser at `/reviewer`. Nobody outside the development
team needs a terminal, JSON or an HTML pack any more.

1. **Access.** The maintainer grants access (below). The teacher signs in with
   the email one-time link at `/reviewer`; the portal never creates accounts
   and cannot grant itself access.
2. **Queue** (`/reviewer?subject=physics`, also maths / biology / chemistry).
   A Server Component computes it on the server from the bundled bank and the
   verified audit chain with `reviewStateOf`. "Ready for you" is ordered
   **capability-first** by the same plan as `wjec:review:priorities`
   (`src/lib/reviewer/priority.ts` → `buildReviewPriorities`, see
   *Prioritisation* below): the review that unlocks most for students leads
   (finishing a half-reviewed question counts as cheaper), then reviews that
   unlock nothing new (a reskin sibling or an already-covered topic), then
   questions that fail a blocking content gate. Each row says why it is worth
   reviewing; a panel shows topics where proof can begin, quick-check
   readiness, the fastest route to the next provable topic, and gate-blocked
   counts by reason. Trust is read exactly as students read it (effective
   ledger applied with `applyHumanVerificationLedger`). The plan is memoised
   per subject on the audit-chain tail (about 1.2 s cold for Physics). It only
   orders the list: nothing is hidden and no rule changes. Questions sent back
   for changes and questions you already approved are listed separately,
   because you cannot act on them. Next/Skip on the review screen follow the
   same order, and the screen says why that question matters.
3. **Review screen.** Stem and options, each part beside its mark scheme and
   worked answer, mapped specification points with board refs, provenance,
   content-gate warnings, reskin siblings, the history on this exact content
   and its fingerprint. Keyboard: `1`–`6` tick the six checks, `A` approves
   (only with all six ticked), `R` requests changes (comment required;
   `Ctrl/⌘+Enter` sends from the comment box), `J` skips, `?` lists shortcuts.
   After a decision the next question opens with focus on its heading.
4. **Decision.** `POST /api/reviewer/decisions` (same-origin, size-capped, zod,
   session + reviewer grant, rate-limited). The server builds the event with
   `appendReviewDecisions` from `src/domain/review-workflow.ts`, so every rule
   in `decisionProblems` applies unchanged: current fingerprint, six checks,
   a comment to request changes, no second approval from the same reviewer,
   blocked validation stages. Reviewer id, role, qualification and the review
   instant come from the grant and the server clock, never the browser.
   "Request changes" is the domain's `revise` decision: it resets approvals on
   that content and keeps the question out of the queue until its content (and
   so its fingerprint) changes — the same `needs changes` state the CLI records.
5. **Trust.** As before, a question is trusted only when
   `REQUIRED_INDEPENDENT_APPROVALS` (2) different reviewers approve the same
   content. One approval makes it *checked*, not trusted. The moment the second
   approval lands, `GET /api/review-ledger` includes it and student devices pick
   it up (next section).

### Why this is the same ledger, not a parallel review table

A deployed web app cannot write files into the repository, and the committed
audit log is read at build time. Rather than inventing a second store, the
portal **continues the existing hash chain** in `public.review_audit_events`:

- Each row's `event` column is a `ReviewAuditEvent` built and hashed by the
  domain (`appendReviewDecisions` / `eventHash`). The first runtime event's
  `previousHash` is the committed log's last `hash` (`genesis` while the
  committed log is empty), and `seq` continues from the committed length.
- Reading always joins the two (`combineAuditLog` in
  `src/lib/reviewer/runtime-ledger.ts`) and verifies the whole chain with the
  domain's `auditLogIssues`. If verification fails, the portal refuses to
  record anything and the public ledger falls back to the committed ledger.
- Ledger entries are never stored separately at runtime. They are derived with
  `promotableLedgerEntries` and merged with `mergeHumanVerificationLedger`,
  exactly what `wjec:review:promote` does, and applied on devices with
  `applyHumanVerificationLedger`, exactly what the bundle does.
- The database enforces append-only on its own: no UPDATE/DELETE/TRUNCATE
  grants, a trigger that rejects update and delete for every role (including
  the service role), a trigger that serialises appends and refuses a row that
  does not continue the current tail, and a binding that a signed-in reviewer
  can only record as themselves with their granted role and qualification.

### How decisions reach students

`GET /api/review-ledger` returns the effective ledger (committed ledger plus
entries derived from the verified runtime chain). The student app fetches it
when online (`src/data/runtime-review-ledger.ts`, driven by the sync engine),
caches the last good copy in IndexedDB so it works offline, and applies it on
every snapshot load with `applyHumanVerificationLedger`, which re-checks the
exact content fingerprint and the trust contract. The applied result is never
written back to question rows. A verified question therefore joins the
`provable` supply on the next fetch (within seconds of opening the app, then
every 10 minutes), without a new build.

### Granting and revoking a teacher

1. The teacher needs a Supabase Auth account: invite them from the Supabase
   dashboard (Authentication → Users → Invite) or have them sign in once in the
   app.
2. In the Supabase SQL editor (runs as the database owner):

   ```sql
   select public.grant_reviewer_role(
     (select id from auth.users where email = 'teacher@school.org'),
     'teacher-jsmith',            -- pseudonymous reviewer id stamped on decisions
     'teacher',                   -- teacher | examiner | subject-expert
     'PGCE Physics; 8 years teaching WJEC A-level',
     'henry'                      -- who granted it
   );
   ```

   Re-running it updates the grant. `select public.revoke_reviewer_role(<uuid>);`
   stops further decisions immediately; past decisions stay in the chain.
   Neither function can be called by a signed-in user.
3. Reviewer ids are what students and the committed ledger see; use a stable
   pseudonym, not an email address.

### Exporting back to the repository (developers)

The runtime chain should periodically be committed so the bundled ledger and
`wjec:review:gates` cover it:

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run wjec:review:pull -- --dry-run
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run wjec:review:pull
npm run wjec:review:promote
npm run wjec:review:gates
```

`wjec:review:pull` writes the combined log only if the whole chain verifies.
Once committed, runtime rows with the same sequence numbers must match the
committed events byte-for-byte (by hash) or the portal stops recording. A
signed-in reviewer can also download the same export from
`/api/reviewer/export`. Do not record decisions through the CLI while the
portal is live without pulling first: the CLI would fork the chain from an
older tail, and the next read would refuse it.

## Developer and seeding tools (CLI)

These commands remain for developers and content seeding (bulk imports, CI
gates, offline experiments). They are **not** the reviewer workflow and should
not be handed to teachers; the portal above is. All of them append to the same
audit log.


1. `npm run wjec:review:priorities` – ranked by product capability unlocked
   (below), per topic and overall. It says which authored question to review
   next, what that unlocks, and where a genuinely new or revised question is
   needed instead.
2. `npm run wjec:review:queue -- <maths|biology|chemistry|physics> <new-dir> --limit=10`
   writes `pack.md` (question and mark scheme side by side, specification
   points, provenance, authored transfer/data classification, reskin warnings,
   gate warnings), `review-return.json` (blank template with exact
   fingerprints) and `queue.json`.
3. Reviewers fill `review-return.json`: `decision` (`approve`, `reject`,
   `revise`), `reviewerId`, `reviewerRole`, `reviewerQualification`,
   `reviewedAt` (ISO instant), the six `checks`, `comments` (required for
   reject/revise) and `classification` (`transferConfirmed`,
   `dataAnalysisConfirmed`, only valid when the question really has a transfer
   link or authored data). Rows left without a reviewer are skipped.
4. `npm run wjec:review:import -- <file> [--dry-run]` validates and appends
   atomically: any invalid row rejects the whole file.
5. `npm run wjec:review:promote [-- --dry-run]` writes ledger entries for
   verified chains.
6. `npm run wjec:review:gates` is the release gate and runs in `npm run verify`.

The older packet route (`npm run wjec:review:apply`) feeds the same audit log,
so there is only one path to trust.

Note which command consumes which file, because the two routes are not
interchangeable: `wjec:review:queue` writes `review-return.json` for
`wjec:review:import`, while `wjec:review:batch` writes `content-review.json`
for `wjec:review:apply`. Both end up in the same audit log, and both still need
two different reviewers before a question is trusted.

### Offline HTML pack (developer fallback)

Kept for the rare reviewer who cannot use the portal (no network at all). It is
a developer-run tool, not part of onboarding. `npm run wjec:review:pack` renders the queue's own selection into a
single self-contained HTML file that works from `file://` with no network, no
build step and no tooling:

```bash
npm run wjec:review:queue -- physics ./pack --limit=10
npm run wjec:review:pack -- ./pack          # writes pack/review-pack.html
```

Give the reviewer that one file. It shows, for every question, the stem, each
part, the full mark scheme and worked answer, the specification statements with
their board refs, the provenance record, any content-gate warnings, the reskin
cluster (approval never extends to these siblings) and the exact content
fingerprint. It collects exactly what the importer requires and nothing else:
reviewer id, reviewer role, reviewer qualification, a timezone-bearing ISO
review instant, all six checks, the decision (approve / needs changes / reject)
and a comment whenever the decision is not an approval.

Two reviewers work independently on the same pack file, so reviewer two never
sees reviewer one's decisions. A question left untouched is omitted from the
return file rather than guessed at.

Then convert and validate, and only then record:

```bash
npm run wjec:review:pack:import -- ./pack/exported-review-pack.html --out=./pack/returns
npm run wjec:review:import -- ./pack/returns/review-return.json --dry-run
npm run wjec:review:import -- ./pack/returns/review-return.json
```

The conversion step validates exactly as the importer does and writes nothing:
it is a translation, not an approval. The page refuses to export an incomplete
attestation (missing reviewer, role or qualification; a date-only, future-dated
or timezone-less instant; an approval with a check left unticked; a rejection
without a comment; or a reviewer approving content they already approved), and
`wjec:review:pack:import` re-checks every one of those against the current bank.
The page's content security policy cannot open a network connection, so opening
the pack cannot leak anything.

## Prioritisation

`src/domain/review-priority.ts` runs a greedy marginal simulation over the
supply audit's clusters (reskins merged), scoring each candidate by the
capabilities it newly unlocks for its topic, divided by the approvals it still
needs, times exam-weight (and exam-proximity when a date is supplied):

| Unlock | Points |
|---|---|
| Helps the cold-start diagnostic (5 topics with a trusted question short enough to ask) | 100 |
| Second distinct trusted question | 80 (+30 Exam Mission proof) |
| First trusted transfer question | 60 |
| First trusted data / practical question (where the topic needs one) | 50 |
| First trusted question; delayed-proof supply (third distinct) | 40 |
| Replaces reskinned trusted supply | 10 |

Target per topic: at least 2 genuinely distinct trusted questions, at least 1
trusted transfer question, a data/practical question where the topic needs
one; a third distinct question makes delayed-proof sessions possible.
Questions that fail a blocking content gate, or that a reviewer sent back for
revision, are not proposed until their content changes.

## Content gates

`src/domain/review-gates.ts`, applied before review and again at release:
missing mark scheme or worked answer, parts not adding up to the total,
multiple-choice key out of range, no specification link, unknown specification
point or topic, stale specification version, transfer label without a baseline
link that differs from the transfer setup, data-analysis label without a table
or data values, unaccepted provenance (unreviewed, imported or AI origin;
generated content is allowed only with a reviewer warning). Duplicate and
reskin detection is `src/domain/reskin.ts`; it is also enforced in proof
(`mark-recovery.ts`) and in "unseen" supply (`learning-evidence.ts`), so a
number swap, noun swap or same-reasoning reskin never counts as independent
evidence.

## What this does not do

No automated check is a human review. Authoring new questions where the
priorities report says "needs new or revised" is still manual work.

## Official-paper tier (separate from review)

A learner-confirmed official WJEC paper match (`src/domain/official-papers.ts`)
is a distinct, per-learner tier — not a review state. It never appears in the
audit log or ledger, never counts in supply/coverage metrics, and never makes
`trustedAssessmentContent` true. It substitutes only for reviewer trust inside
the two proof gates, and only with the settings flag plus WJEC-terms
confirmation both on, for a paper the learner had not previously attempted.
The manifest (`src/content/official-papers/manifest.json`) holds official URLs
plus SHA-256 digests only — never paper PDFs or question text — and ships
empty until digests are verified from WJEC's site. Fingerprint a file with
`npm run wjec:papers:fingerprint`.
