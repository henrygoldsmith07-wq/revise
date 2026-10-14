# Sunday plan: what moved, what’s next

The Sunday plan is an optional **in-app message**, not an email, browser
notification or push notification. There is no external notification backend.
It is off by default, including for existing profiles whose settings do not
contain the new fields. On Today, expand **Plan, pace and outlook** (or **Sunday
plan** on an empty profile) to turn it on, turn it off, or preview it without
opting in. It does not add streaks, points, rewards or guilt messaging.

## What the message actually says

- **What moved:** counts of actual recorded answers, card reviews and distinct
  topics during the previous Sunday–Saturday, compared with the preceding
  Sunday–Saturday. These describe changes in practice activity, not proven
  learning, higher marks, improved grades or exam readiness. Marks and AI
  feedback are not used in the calculation or included in the snapshot.
- **What’s next:** previously studied cards due at capture, followed by the
  nearest valid upcoming exam date the learner actually saved for an enrolled
  subject. New, suspended, still-buried and unenrolled cards are excluded.
  Missing or past exam dates do not become invented countdowns.
- **Actions:** links to the live due-review queue, practice filtered to the
  next exam’s subject, Settings to add a real date, or a starting quick check.
  The destination is live: its data can have changed since the message froze.

## Weekly cadence and freshness

A week begins at **Sunday 00:00 in the device’s local timezone**, not UTC.
The first visit in that week creates one snapshot, even if the app was not
opened on Sunday itself. There is no background scheduler: a closed app does
not create or deliver anything. A tab left open re-evaluates at local midnight,
and focus/visibility changes catch suspended tabs up. Calendar-date arithmetic
handles DST without treating every local day as exactly 24 hours.

The first saved snapshot is retained unchanged until the next Sunday week.
Later practice, edited exam dates and subsequently synced history do not rewrite
it. The message shows its capture time, timezone, week and next Sunday. Counts
and “days away” explicitly refer to capture, not a live countdown. New live data
is available through the action links. A preview is freshly computed on demand,
is labelled as a preview and never replaces a saved weekly snapshot.

The snapshot is made from **complete activity persisted locally**, not the
store’s truncated first-paint history window. It is not an assertion that the
cloud or another device is up to date. No activity produces a starting plan
without a progress claim; history older than the previous week is explicitly
flagged as old. Study outside the app or not yet synced cannot be counted.

## Storage and consent

`UserSettings.sundayPlanEnabled` is an additive optional boolean, default false.
`UserSettings.sundayPlanSnapshot` holds the current weekly snapshot. They use
the existing IndexedDB settings record; no database store or schema-version
change is needed. Weekly capture reads complete persisted local data and saves
IndexedDB first, then queues the settings row through the existing sync outbox.
A configured account can therefore sync this summary as part of settings;
“in-app” does not mean “never replicated”. No answer text, marks, notification
address or push token is added to the snapshot.

The settings write preserves the first snapshot for a week, including concurrent
local tabs and unrelated settings updates from a stale view. Missing weeks are
not backfilled and clock/timezone rollback does not resend an earlier week.
Cross-device concurrent settings updates retain the app’s existing settings
last-write-wins sync semantics; this is not a globally exactly-once notification
service. Turning off prevents subsequent captures and hides the recurring
message; the existing snapshot remains in settings until replaced or learner
data is erased. Re-enabling during the same week reuses it.

## Verification

`npx vitest run tests/sunday-plan.test.ts` exercises deterministic injected
clocks and IANA zones, local Sunday boundaries on either side of Greenwich,
DST and year rollover, last-week windows, duplicate/invalid/future activity,
no-data and old-data behavior, valid saved exams, due-review exclusions,
default-off consent, preview without persistence, complete history beyond the
boot window, user isolation, immutable snapshots, concurrent local captures,
revocation and renewal in the following week. Source checks protect the in-app
and freshness disclosures and keep this secondary component out of AppShell.
