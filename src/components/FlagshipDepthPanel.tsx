import { allTopics, getSubject } from "@/domain/curriculum";
import { seedCardsForTopic, seedQuestions } from "@/content";
import { buildSubjectDepth, FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { Panel, SectionHeading } from "./ui";

// Flagship depth ledger: for the four WJEC A-level flagships, how far is each
// specification statement from the full asset tree (4+ independent questions
// spanning recall/application/transfer, worked solutions, cards, notes)?
// Computed live from the same authored bank CI pins.

export function FlagshipDepthPanel() {
  const rows = FLAGSHIP_SUBJECTS.map((flagship) => {
    const topics = allTopics().filter((t) => t.id.startsWith(`${flagship.subjectId}.`));
    const cardCounts = new Map(topics.map((t) => [t.id, seedCardsForTopic(t, "benchmarks-flagship").length] as const));
    const depth = buildSubjectDepth({ topics, questions: seedQuestions, cardCountByTopic: cardCounts });
    return { flagship, depth };
  });

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Flagship depth"
        hint="Assets per specification statement — depth over breadth"
      />
      <div className="grid sm:grid-cols-2 gap-3">
        {rows.map(({ flagship, depth }) => {
          const zeroQ = depth.specPoints.filter((sp) => sp.distinctQuestions === 0).length;
          const withFour = depth.specPoints.filter((sp) => sp.distinctQuestions >= 4).length;
          const topGap = depth.gaps[0];
          return (
            <Panel key={flagship.subjectId}>
              <h3 className="text-sm font-semibold">{getSubject(flagship.subjectId)?.name ?? flagship.label}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <Stat label="Gold statements" value={`${depth.goldStatements}/${depth.statementsTotal}`} hint="≥4 questions spanning recall+application+transfer" />
                <Stat label="Questions / statement" value={depth.questionsPerStatement.toFixed(2)} hint="target ≥ 4" />
                <Stat label="Statements with 0 questions" value={String(zeroQ)} hint="authoring queue" />
                <Stat label="Statements with ≥4 questions" value={`${withFour}`} hint="independent coverage" />
              </div>
              {topGap ? (
                <p className="text-[11px] text-ink3 mt-2">
                  Next up: <code className="font-mono">{topGap.specPointId.split(".").pop()}</code> in{" "}
                  {topGap.topicId.split(".").pop()} — missing{" "}
                  {topGap.missing.filter((m) => m !== ("coverage" as never)).join(", ") || "first question"}
                </p>
              ) : null}
            </Panel>
          );
        })}
      </div>
      <p className="text-xs text-ink3">
        Goal per flagship: every specification statement carries retrieval cards plus simple, application,
        unfamiliar-context, misconception and harder/synoptic questions with worked solutions and verified provenance.
        Source: <code className="font-mono">src/domain/flagship.ts</code>, pinned by{" "}
        <code className="font-mono">tests/flagship-depth.test.ts</code>.
      </p>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[8px] border border-line px-2.5 py-2" title={hint}>
      <p className="text-[11px] text-ink3">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-ink mt-0.5">{value}</p>
    </div>
  );
}
