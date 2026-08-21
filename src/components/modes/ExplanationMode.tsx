"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { assessExplanation, explanationBandLabel } from "@/domain/explanation-mastery";
import type { ExplanationAssessment } from "@/domain/explanation-mastery";
import type { Topic } from "@/domain/types";
import { AnswerInput } from "../AnswerInput";
import { RichText } from "../RichText";
import { Button, EmptyState, Panel, Pill, ProgressBar, SectionHeading, cx } from "../ui";
import { CreditedIcon, ICON_SIZE, MissedIcon, PracticeIcon } from "../icons";

export function ExplanationMode({
  topics,
  initialTopicId,
  onExit,
}: {
  topics: Topic[];
  initialTopicId?: string;
  onExit: () => void;
}) {
  const firstTopicId = initialTopicId && topics.some((topic) => topic.id === initialTopicId)
    ? initialTopicId
    : topics[0]?.id ?? "";
  const [topicId, setTopicId] = useState(firstTopicId);
  const [answer, setAnswer] = useState("");
  const [assessment, setAssessment] = useState<ExplanationAssessment | null>(null);

  const topic = useMemo(
    () => topics.find((candidate) => candidate.id === topicId) ?? topics[0],
    [topicId, topics],
  );

  if (!topic) {
    return <EmptyState title="No topics in this selection" body="Choose a wider subject or topic scope first." action={<Button onClick={onExit}>Back</Button>} />;
  }

  function changeTopic(nextTopicId: string) {
    setTopicId(nextTopicId);
    setAnswer("");
    setAssessment(null);
  }

  function submit() {
    if (!answer.trim()) return;
    setAssessment(assessExplanation(topic, answer));
  }

  const securePoints = assessment?.points.filter((point) => point.status === "secure") ?? [];
  const developingPoints = assessment?.points.filter((point) => point.status === "developing") ?? [];
  const missingPoints = assessment?.points.filter((point) => point.status === "missing") ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PracticeIcon size={ICON_SIZE.md} aria-hidden className="text-ink3" />
            <h1 className="text-xl font-semibold tracking-tight">Explanation mastery</h1>
          </div>
          <p className="text-sm text-ink3 mt-0.5 max-w-xl">
            Explain a topic from memory, then see which ideas made it into your explanation.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>End</Button>
      </header>

      <Panel className="space-y-3">
        <SectionHeading title="Choose a topic" hint="The reference points stay hidden until you submit." />
        <select
          value={topic.id}
          onChange={(event) => changeTopic(event.target.value)}
          className="field text-sm"
          aria-label="Topic to explain"
        >
          {topics.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
          ))}
        </select>
      </Panel>

      {!assessment ? (
        <Panel className="space-y-4">
          <div>
            <Pill tone="accent">Retrieval practice</Pill>
            <h2 className="text-lg font-semibold text-ink mt-3">Teach {topic.title}</h2>
            <p className="text-sm text-ink2 mt-1">
              Write the explanation you would give to someone seeing this for the first time. Include the links,
              conditions and equations that matter — do not just list vocabulary.
            </p>
          </div>
          <AnswerInput
            id="explanation-answer"
            value={answer}
            onChange={setAnswer}
            rows={9}
            placeholder="Explain it in your own words…"
          />
          <Button variant="primary" className="w-full" disabled={!answer.trim()} onClick={submit}>
            Check my explanation
          </Button>
          <p className="text-[11px] text-ink3">
            Checked on this device against the topic’s authored key points. It is a prompt for revision, not a full
            mark-scheme judgement.
          </p>
        </Panel>
      ) : (
        <Result
          assessment={assessment}
          topic={topic}
          securePoints={securePoints}
          developingPoints={developingPoints}
          missingPoints={missingPoints}
          onTryAgain={() => setAssessment(null)}
          onChangeTopic={() => changeTopic(topics.find((candidate) => candidate.id !== topic.id)?.id ?? topic.id)}
        />
      )}
    </div>
  );
}

function Result({
  assessment,
  topic,
  securePoints,
  developingPoints,
  missingPoints,
  onTryAgain,
  onChangeTopic,
}: {
  assessment: ExplanationAssessment;
  topic: Topic;
  securePoints: ExplanationAssessment["points"];
  developingPoints: ExplanationAssessment["points"];
  missingPoints: ExplanationAssessment["points"];
  onTryAgain: () => void;
  onChangeTopic: () => void;
}) {
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Pill tone={assessment.band === "secure" ? "success" : assessment.band === "building" ? "accent" : "review"}>
              {explanationBandLabel(assessment.band)}
            </Pill>
            <h2 className="text-lg font-semibold text-ink mt-2">{topic.title}</h2>
            <p className="text-sm text-ink3 mt-0.5">
              {assessment.answerWordCount} words · {assessment.secureCount} of {assessment.points.length} key points secure
            </p>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-ink">{Math.round(assessment.score * 100)}%</p>
        </div>
        <div className="mt-4">
          <ProgressBar value={assessment.score} label="Idea coverage" tone={assessment.band === "secure" ? "success" : "accent"} />
        </div>
        <p className="text-sm text-ink2 mt-4">
          {assessment.missingCount
            ? "Your next pass should make the missing ideas explicit, rather than hoping the examiner infers them."
            : "You covered every key point. Try the explanation again more concisely to make the structure exam-ready."}
        </p>
      </Panel>

      <PointGroup title="Secure" tone="success" points={securePoints} icon={<CreditedIcon size={ICON_SIZE.md} aria-hidden />} />
      <PointGroup title="Developing" tone="accent" points={developingPoints} icon={<PracticeIcon size={ICON_SIZE.md} aria-hidden />} />
      <PointGroup title="Still to add" tone="review" points={missingPoints} icon={<MissedIcon size={ICON_SIZE.md} aria-hidden />} />

      <Panel>
        <SectionHeading title="Reference summary" hint="Use this to plan your next explanation." />
        <RichText className="text-sm text-ink2">{topic.summary}</RichText>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="primary" onClick={onTryAgain}>Explain it again</Button>
          <Button onClick={onChangeTopic}>Try another topic</Button>
        </div>
      </Panel>
    </div>
  );
}

function PointGroup({
  title,
  tone,
  points,
  icon,
}: {
  title: string;
  tone: "success" | "accent" | "review";
  points: ExplanationAssessment["points"];
  icon: ReactNode;
}) {
  if (!points.length) return null;
  return (
    <Panel>
      <div className={cx("flex items-center gap-2 mb-3", tone === "success" ? "text-success" : tone === "review" ? "text-review" : "text-accent")}>
        {icon}
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <Pill>{points.length}</Pill>
      </div>
      <ul className="space-y-2">
        {points.map((point) => (
          <li key={point.point} className="text-sm text-ink2 pl-3 border-l-2 border-line">
            <RichText>{point.point}</RichText>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
