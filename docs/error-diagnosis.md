# Post-marking error diagnosis (classifier.dev)

What happens **after** a mistake is where grades are won or lost. This module
is the high-value part of that: once marking has decided the score, classifier.dev
decides **why** the mark was lost, and the error type names the intervention.

The integration is deliberately narrow. classifier.dev is a keyless zero-shot
text classifier; it is good at one job here — bucketing an incorrect or partial
answer into an error type — and is used for nothing else.

## Pipeline

```
question
→ existing marking (rubric / AI / cache — unchanged, awarded & max fixed)
→ incorrect or partial response
→ classifier.dev error diagnosis (versioned taxonomy, confidence-gated)
→ targeted remediation
→ mastery & scheduling signal
```

Nothing upstream changes. `markQuestion` / `aiMark` keep producing the marks;
the diagnosis reads the already-final `awarded`/`max` and never writes to them.
A full-mark part never enters diagnosis — there is no error to explain, and
inventing one would be dishonest.

## Versioned taxonomy (`error-v1`)

`src/domain/error-taxonomy.ts` owns the labels. Versioning is **additive
within a major**: labels are added, never renamed or removed, so a stored
diagnosis stays interpretable. Every diagnosis record carries
`taxonomyVersion`, and precision/recall can be sliced per version.

| Label | Meaning |
|---|---|
| `knowledge-gap` | required fact not known or not written |
| `misconception` | wrong idea applied confidently |
| `formula-selection` | wrong equation chosen for the situation |
| `calculation` | arithmetic / rearrangement / working slip |
| `unit-error` | missing or wrong units, significant figures |
| `terminology` | talked around the required term |
| `insufficient-detail` | idea present but too vague to earn the point |
| `command-word` | did not do what the command verb demanded |
| `application` | fact known but not transferred to the context |
| `reasoning` | logical link or justification missing or invalid |
| `careless-error` | slip on an otherwise strong answer |
| `other` | below threshold or genuinely ambiguous |

## Category → intervention

`src/domain/error-remediation.ts` maps every label to one intervention. The
five requested pairs, plus the rest:

| Category | Intervention |
|---|---|
| `misconception` | targeted explanation and question |
| `calculation` | worked scaffold |
| `terminology` | definition recall |
| `command-word` | exam technique |
| `knowledge-gap` | content retrieval |
| `formula-selection` | worked scaffold |
| `unit-error` | exam technique (units / sig-fig check) |
| `insufficient-detail` | exam technique (state every point explicitly) |
| `application` | focused practice in a fresh context |
| `reasoning` | targeted explanation (rebuild the chain) |
| `careless-error` | review the final line |
| `other` | re-attempt, then review the mark scheme |

Each mapping carries a plain-language action and a minute budget the adaptive
session can spend. Diagnosis also emits two scheduling signals:
`ERROR_MASTERY_PENALTY` (a misconception costs more mastery than a slipped
unit) and `ERROR_RETEST_URGENCY` (how soon the repair loop resurfaces it).

## Never overriding marking

Three structural guarantees:

1. The diagnosis only reads `awarded`/`max` from the finished mark; it has no
   write path to `MarkedPart`.
2. Only incorrect or partial parts enter diagnosis (`needsDiagnosis`).
3. A gated or low-confidence verdict becomes `other` — the raw label is kept
   for calibration, but no remediation or mastery signal is derived from it.

## Confidence thresholds and fallback

- `ERROR_CONFIDENCE_THRESHOLD = 0.7` — below this a classifier.dev label is
  recorded as `other` (raw label preserved) and is not actionable.
- `ERROR_CONFIDENCE_FLOOR = 0.35` — below this the label is discarded entirely.
- Smart tier escalation: the uncertain middle (0.35–0.7) is re-asked on the
  smart tier before gating.
- **Offline / failure fallback**: a deterministic local classifier
  (`error-local-classifier.ts`) answers immediately from the same signals, so
  the result view renders offline and no diagnosis is ever missing. When the
  remote call fails, times out, returns an unknown label or a gated verdict
  while the local read is confident, the local verdict wins and provenance
  records `local-fallback`.
- Provenance on every diagnosis: `classifier-dev`, `local-fallback` or
  `offline` — plus `taxonomyVersion`, `gated` and the raw remote label.

## Hierarchical specification-point routing

`src/domain/spec-routing.ts` routes **subject → topic → small candidate set**,
never the whole specification in one flat request:

1. `candidateTopics(subjectId, text, 3)` — token-overlap shortlist of the
   three most relevant topics.
2. `candidateSpecPoints(topic, text, 4)` per topic — capped at
   `SPEC_ROUTE_MAX_CANDIDATES = 8` statements in total.
3. The shortlist feeds a focused classifier.dev request per part.

## Evaluation

`src/domain/error-eval.ts` ships a labelled corpus (one decisive fixture per
label) plus two reporting primitives:

- `precisionRecallPerLabel` — precision, recall, F1 and support per label;
- `calibrationReport` — confidence binned against accuracy, so an
  over-confident classifier is visible rather than trusted.

`tests/error-diagnosis.test.ts` pins the taxonomy order, the five required
category→intervention mappings, gating behaviour, the mark-untouched
invariant, the routing caps, and both evaluation reports.

## Where it plugs in

`QuestionRunner` computes the diagnosis from the deterministic local read the
moment marking finishes (so it renders offline), then asks classifier.dev to
refine only the parts the local read could not act on. The refined diagnosis
replaces the display diagnosis; the marks on screen never move.

## Turning it off

`CLASSIFIER_DISABLED=1` (see `.env.example`) forces the deterministic local
classifier always — offline use, CI, and a strict no-third-party-text policy.
Student text is PII-masked before any request leaves the device, exactly as
for every other AI task in this app.
