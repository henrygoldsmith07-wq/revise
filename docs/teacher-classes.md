# Live teacher classes

This is a real Supabase collaboration workflow, separate from the synthetic
teacher demo and separate from the learner's local-first revision history.
It requires a signed-in account, configured Supabase and the additive migration
`supabase/migrations/20261014000100_teacher_classes.sql`. No service-role key
is used by `src/data/classes.ts`; browser requests use the caller's session.

## Teacher access and review

Only an unrevoked `reviewer_roles` grant with `role = 'teacher'` can create or
manage a class. Existing `examiner` and `subject-expert` grants do not confer
classroom access. Grants remain an operator action through the existing reviewer
workflow, never a self-service browser update. Revocation immediately denies
class, assignment and shared-evidence access on subsequent server requests.
A teacher can see only their own classes, rosters and evidence. Heatmap question
links use the canonical `/reviewer/review/<encoded question id>` workflow; they
neither record an approval nor bypass its human-review gates.

## Joining, age band and permission

1. The teacher creates a named class. PostgreSQL generates its unguessable
   64-hex-character join code from two cryptographic UUIDs (244 random bits).
   Only its active teacher can read the class row or code. Students cannot
   browse classes or codes and receive no peer roster.
2. A learner enters a code, a chosen alias (2–32 characters, letters/numbers,
   spaces, `_` or `-`), age band and explicit sharing consent. Use a pseudonym,
   not a real name, email, date of birth or contact detail. Class names and
   assignment titles must not contain pupil information.
3. Under-13 joins and joins without consent are refused in SQL. Self-declared
   `13-17` membership remains pending until the teacher records that appropriate
   school/guardian authorization has been obtained for this specific pupil.
   Adults (`18+`) start active. This is a conservative engineering permission
   gate, not age verification or a determination of legal consent/lawful basis.
4. Invalid guesses consume the same persistent per-account join budget as valid
   joins: eight requests per 15-minute window. The RPC returns `false` on a
   denied join so its counter is committed rather than rolled back. The browser
   presents a generic failure, not whether a particular code exists. Accounts
   cannot read or reset their rate-limit rows. This does not prevent Sybil abuse
   across many independently created accounts.

Repeating a join cannot rewrite age, consent or authorization. Leaving and
rejoining is a new consent event; old evidence cannot be replayed under it.
No school directory, parental identity check or external authorization evidence
is collected. The teacher's confirmation is not proof that the authorization
was valid. DPO/controller review is still required before a real-school rollout.

## Assignments and explicit snapshots

A teacher publishes a titled assignment with a due date, either a `check` with
1–100 question IDs or a `topic` with one topic ID. Only active members can read
published assignments. Pending pupils cannot read them, upload evidence or
appear in evidence-derived statistics. Students can read only their own
membership and evidence, not peers' aliases or marks.

Sharing is a separate learner action for a specific active class. It is not
continuous access to the learner's history. `share_class_evidence` accepts at
most 100 closed-shape metadata snapshots in one atomic request:

- attempt UUID and the authenticated learner's account UUID;
- question and topic identifiers (restricted identifier syntax);
- awarded/max marks, one optional fixed misconception category and timestamp.

No answer, feedback, working, email, free-text misconception, full attempt JSON
or other extra key is accepted. The adapter reconstructs this allowlisted
shape, and SQL independently rejects unknown keys and another learner's UUID.
The join form accepts the generated 64-character code. On an explicit share,
`loadClassEvidenceSnapshot` reads the complete owner-scoped persisted attempts
and mistakes, not the progressively hydrated UI window. The adapter sends
100-record batches and rechecks caller identity between requests. Each request
is atomic, not the entire multi-batch share: a later failure can leave earlier
batches shared. The UI reports that possibility; retrying is safe because the
server deduplicates attempt IDs. No background or automatic sharing is added.
Each snapshot must match an assignment's question list or topic, and its
attempt timestamp must be at or after consent **and** teacher authorization
where recorded, never in the future. The `(class, learner, attempt)` key dedupes
retries; a replay cannot replace an earlier snapshot. Membership is checked
and locked on write, and checked again by RLS on read. No additional permission
to read the `attempts` table is granted to teachers.

These are learner-supplied local-attempt snapshots, not authenticated marks or
verified outcomes. The database validates shape, boundaries and permission,
not whether a learner really made that attempt or accurately reported its time,
question, topic or mark. Identifier syntax is not a content-bank authenticity
check. Do not describe this heatmap as exam proof, a complete learning record
or an independent assessment of a pupil.

`buildClassHeatmap` uses actual shared records only: deduplicated occurrences,
distinct students, marks lost and question IDs per fixed misconception tag.
Missing evidence means no data, not zero attainment; there is no demo denominator.

## Revocation, retention and deletion

Leaving calls `leave_teacher_class`, which synchronously deletes the membership
and cascades all of that pupil's snapshots for that class. There is no offline
queued sharing/rejoin retry that can restore consent after leaving. A teacher
withdrawing authorization returns membership to pending and deletes its shared
snapshots; restoring authorization establishes a new upload timestamp boundary.
Other local attempts and other classes are unaffected. No application can
recall screenshots, exports or information already seen by an authorized person.

Class metadata remains until membership/class/account deletion; there is not
currently a time-based term-end purge or a self-service class-delete UI.
The join-rate record is one bounded row per account and is reused between
windows. All five class tables have a `user_id` foreign key to `auth.users`
with `ON DELETE CASCADE`, so the existing service-only account residual check
discovers them. Learner account deletion removes memberships, snapshots and
join counters. Teacher account deletion also removes classes, assignments,
rosters and all associated snapshots through cascades. Device-local erasure
is not server-side consent revocation or account deletion.

## Verification and deployment limits

`tests/classes.test.ts` covers pure heatmap aggregation, canonical review links,
caller-session adapter behavior, bounded batches, partial failures and metadata-only
payloads. `tests/class-sharing-persistence.test.ts` checks complete persisted
history beyond the boot window and fixed-profile isolation.
`tests/classes-sql.test.ts` executes the real schema and migration in PGlite,
including cross-user attacks, join guessing, authorization, snapshot boundaries,
revocation and deletion cascades/residuals. This is local PostgreSQL evidence,
not verification of Supabase deployment settings, a real school's authorization
process or legal compliance. Apply the migration and run equivalent staging
checks before claiming the deployed service enforces these controls.
