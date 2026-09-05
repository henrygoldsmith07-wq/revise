import { buildMockStudyPlan, type MockPlanActivity, type MockStudyPlan, type MockTopicCoverage } from "@/domain/mock-planning";
import type { Attempt, Mistake, Paper, Question, Topic, TopicMastery } from "@/domain/types";
import { Button, ButtonLink, Panel, Pill, ProgressBar, SectionHeading } from "./ui";

const ACTIVITY_LABEL: Record<MockPlanActivity, string> = {
  learn: "Learn in steps",
  practice: "Practise questions",
  recall: "Retrieve",
  paper: "Sit the mock",
};

const NEED_LABEL: Record<MockTopicCoverage["need"], string> = {
  learn: "Start here",
  practise: "Build confidence",
  refresh: "Keep warm",
};

function topicTone(need: MockTopicCoverage["need"]): "danger" | "review" | "success" {
  if (need === "learn") return "danger";
  if (need === "practise") return "review";
  return "success";
}

function stepTone(activity: MockPlanActivity): "accent" | "review" | "success" {
  if (activity === "learn") return "accent";
  if (activity === "paper") return "success";
  return "review";
}

function topicHref(activity: "learn" | "practice" | "recall", subjectId: string, topicId: string): string {
  if (activity === "learn") return `/lesson?subject=${encodeURIComponent(subjectId)}&topic=${encodeURIComponent(topicId)}`;
  if (activity === "recall") {
    return `/practice?mode=recall&subject=${encodeURIComponent(subjectId)}&topic=${encodeURIComponent(topicId)}`;
  }
  return `/practice?subject=${encodeURIComponent(subjectId)}&topic=${encodeURIComponent(topicId)}`;
}

export function MockStudyPlan({
  paper,
  questions,
  topics,
  mastery,
  attempts,
  mistakes,
  onStartMock,
}: {
  paper: Pick<Paper, "id" | "title" | "subjectId" | "questionIds" | "totalMarks">;
  questions: Question[];
  topics: Topic[];
  mastery: TopicMastery[];
  attempts: Attempt[];
  mistakes?: Mistake[];
  onStartMock?: () => void;
}) {
  const plan: MockStudyPlan = buildMockStudyPlan({ paper, questions, topics, mastery, attempts, mistakes });

  return (
    <section aria-label="Mock preparation plan" className="space-y-3">
      <SectionHeading
        title="Mock preparation plan"
        hint="Built from the topics and marks tested by this paper, not from a generic subject checklist."
      />
      <Panel className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Prepare for</p>
            <h3 className="text-base font-semibold text-ink mt-0.5">{plan.paperTitle}</h3>
            <p className="text-xs text-ink2 mt-1">{plan.summary}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Pill tone="accent">{plan.questionCount} questions</Pill>
            <Pill>{plan.mappedMarks}/{plan.totalMarks} marks mapped</Pill>
          </div>
        </div>

        {plan.topics.length ? (
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What this mock tests</p>
                <p className="text-xs text-ink2 mt-0.5">Readiness and mark share decide the order. Retrieve each topic before applying it to a question.</p>
              </div>
              <span className="text-[11px] text-ink3 shrink-0">{plan.topics.length} topics</span>
            </div>
            <ol className="space-y-3">
              {plan.topics.map((topic, index) => (
                <li key={topic.topicId} className="rounded-xl border border-line bg-surface2/50 px-3 py-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px] font-bold text-ink3">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{topic.title}</p>
                          <Pill tone={topicTone(topic.need)}>{NEED_LABEL[topic.need]}</Pill>
                        </div>
                        <span className="text-xs tabular-nums text-ink3">
                          {topic.marks} mark{topic.marks === 1 ? "" : "s"} · {topic.questionCount} question{topic.questionCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <ProgressBar
                          value={topic.mastery ?? 0}
                          label={topic.mastery == null ? "No measured mastery yet" : `Current mastery · ${Math.round(topic.mastery * 100)}%`}
                          tone={topicTone(topic.need)}
                        />
                        <span className="text-[11px] text-ink3 tabular-nums sm:text-right">
                          {Math.round(topic.markShare * 100)}% of mapped marks
                        </span>
                      </div>
                      <p className="text-xs text-ink2 mt-2 leading-snug">{topic.rationale}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <ButtonLink href={topicHref("learn", plan.subjectId, topic.topicId)} size="sm" variant="primary">
                          Learn in steps
                        </ButtonLink>
                        <ButtonLink href={topicHref("recall", plan.subjectId, topic.topicId)} size="sm">
                          Active recall
                        </ButtonLink>
                        <ButtonLink href={topicHref("practice", plan.subjectId, topic.topicId)} size="sm">
                          Practise questions
                        </ButtonLink>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="border-t border-line pt-4">
            <p className="text-sm font-semibold text-ink">Map the mock before planning it</p>
            <p className="text-xs text-ink3 mt-1">Extract the questions and add topic tags so each preparation block points at a real requirement.</p>
          </div>
        )}

        {plan.steps.length ? (
          <div className="border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Your study route</p>
                <p className="text-xs text-ink2 mt-0.5">Written teaching → active recall → exam questions. Video is optional support, not a prerequisite.</p>
              </div>
              <span className="text-[11px] text-ink3 shrink-0">{plan.steps.length} steps</span>
            </div>
            <ol className="mt-3 space-y-2">
              {plan.steps.map((step) => {
                const action = step.topicId && (step.activity === "learn" || step.activity === "practice" || step.activity === "recall")
                  ? (
                    <ButtonLink
                      href={topicHref(step.activity, plan.subjectId, step.topicId)}
                      size="sm"
                      variant={step.activity === "learn" ? "primary" : "secondary"}
                    >
                      {ACTIVITY_LABEL[step.activity]}
                    </ButtonLink>
                  )
                  : step.activity === "paper" && onStartMock
                    ? <Button size="sm" variant="primary" onClick={onStartMock}>{ACTIVITY_LABEL.paper}</Button>
                    : null;
                return (
                  <li key={step.id} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-onaccent">
                      {step.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{step.title}</p>
                        <Pill tone={stepTone(step.activity)}>{step.minutes} min</Pill>
                      </div>
                      <p className="text-xs text-ink3 mt-0.5 leading-snug">{step.rationale}</p>
                    </div>
                    {action}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {plan.unmappedQuestionCount ? (
          <p className="border-t border-line pt-3 text-xs text-review">
            {plan.unmappedQuestionCount} question{plan.unmappedQuestionCount === 1 ? " is" : "s are"} not mapped to a syllabus topic yet, so those marks are not included in the focused route.
          </p>
        ) : null}
      </Panel>
    </section>
  );
}
