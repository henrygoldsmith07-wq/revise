import Link from "next/link";
import { getTopic } from "@/domain/curriculum";
import type { PaperWeaknessAnalysis } from "@/domain/paper-weakness";
import { ButtonLink, Panel, Pill, ProgressBar, SectionHeading, StatTile } from "./ui";

export function PaperWeaknessPanel({ analysis }: { analysis: PaperWeaknessAnalysis }) {
  const weakTopics = analysis.topics.filter((topic) => topic.marksLost > 0).slice(0, 4);
  const weakQuestions = analysis.questions.filter((question) => question.marksLost > 0).slice(0, 4);
  const openMistakes = analysis.topics.reduce((sum, topic) => sum + topic.openMistakeCount, 0);

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Post-paper weakness analysis"
        hint="Evidence from this sitting only — use it to choose the next revision block."
      />
      <Panel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile
            label="Paper score"
            value={`${analysis.marksGained}/${analysis.marksAvailable}`}
            sub={analysis.accuracy == null ? "no marked answers" : `${Math.round(analysis.accuracy * 100)}%`}
            tone={analysis.accuracy == null ? undefined : analysis.accuracy >= 0.7 ? "success" : analysis.accuracy >= 0.5 ? "review" : "danger"}
          />
          <StatTile label="Marks lost" value={analysis.marksLost} sub="recoverable signal" tone={analysis.marksLost ? "danger" : "success"} />
          <StatTile label="Questions" value={analysis.attempts} sub="marked in this sitting" />
          <StatTile label="Open mistakes" value={openMistakes} sub="in the repair queue" tone={openMistakes ? "review" : "success"} />
        </div>

        <p className="text-sm text-ink mt-4">{analysis.headline}</p>

        {weakTopics.length ? (
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Start here</p>
            <ul className="space-y-3">
              {weakTopics.map((topic) => {
                const curriculumTopic = getTopic(topic.topicId);
                const recommendation = analysis.recommendations.find((row) => row.topicId === topic.topicId);
                return (
                  <li key={topic.topicId}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-ink truncate">{curriculumTopic?.title ?? topic.topicId}</span>
                      <span className="text-xs text-danger tabular-nums shrink-0">
                        {topic.marksLost} lost · {Math.round(topic.accuracy * 100)}%
                      </span>
                    </div>
                    <ProgressBar value={topic.accuracy} tone={topic.accuracy < 0.5 ? "danger" : "review"} />
                    {recommendation ? <p className="text-[11px] text-ink3 mt-1">{recommendation.reason}</p> : null}
                    {topic.missedPoints.length ? (
                      <p className="text-[11px] text-ink3 mt-1">
                        Missed: {topic.missedPoints.slice(0, 2).join("; ")}
                      </p>
                    ) : null}
                    <ButtonLink href={`/practice?topic=${encodeURIComponent(topic.topicId)}`} size="sm" className="inline-block mt-1.5">
                      Practise topic
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-success mt-4 pt-4 border-t border-line">
            No topic-specific weakness was detected. Keep the current balance and retest any isolated mistakes in Progress.
          </p>
        )}

        {weakQuestions.length ? (
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Hardest questions</p>
            <ul className="space-y-1.5">
              {weakQuestions.map((question) => (
                <li key={question.questionId} className="flex items-center justify-between gap-2 text-xs">
                  <Link href={`/practice?question=${encodeURIComponent(question.questionId)}`} className="text-ink2 truncate hover:underline">
                    {question.label} · {question.stem.slice(0, 72)}
                  </Link>
                  <span className="text-danger tabular-nums shrink-0">
                    {question.marksLost}/{question.marksAvailable} lost
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {analysis.causes.length || analysis.commands.length ? (
          <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mr-1">Causes</span>
            {analysis.causes.slice(0, 4).map((cause) => (
              <Pill key={`cause-${cause.label}`} tone="danger">
                {cause.label} · {cause.marksLost}m
              </Pill>
            ))}
            {analysis.commands.slice(0, 3).map((command) => (
              <Pill key={`command-${command.label}`} tone="review">
                {command.label} · {command.marksLost}m
              </Pill>
            ))}
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
