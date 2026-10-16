"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink, Panel } from "@/components/ui";
import { loadAuthoredQuestions } from "@/data/authored-questions";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { buildPracticalTracks } from "@/domain/practical-track";
import type { Question } from "@/domain/types";
import { useStoreFields } from "@/state/store";

export default function PracticalsPage() {
  const { userId } = useStoreFields("userId");
  return <PracticalPaths key={userId} />;
}

function PracticalPaths() {
  const store = useStoreFields("settings", "questions", "attempts", "cards", "userId");
  const [authored, setAuthored] = useState<readonly Question[]>([]);
  const [bankState, setBankState] = useState<"loading" | "loaded" | "unavailable">("loading");
  const [reload, setReload] = useState(0);
  const [chosenSubject, setChosenSubject] = useState("");
  const [chosenTopic, setChosenTopic] = useState("");

  useEffect(() => {
    let active = true;
    loadAuthoredQuestions().then((questions) => {
      if (!active) return;
      setAuthored(questions);
      setBankState("loaded");
    }).catch(() => { if (active) setBankState("unavailable"); });
    return () => { active = false; };
  }, [reload]);

  const questions = useMemo(() => {
    const rows = new Map(store.questions.map((question) => [question.id, question]));
    // Current authored bundle wins over an older persisted copy.
    for (const question of authored) if (rows.has(question.id)) rows.set(question.id, question);
    // Do not resurrect questions absent from the profile's resolved pool: it
    // honours the learner's local/wire tombstones in loadQuestionRows.
    return [...rows.values()];
  }, [authored, store.questions]);
  const tracks = useMemo(() => buildPracticalTracks({
    subjects: allSubjects(), topics: allTopics(), questions,
    attempts: store.attempts, cards: store.cards,
    enrolledSubjectIds: store.settings.subjectIds, userId: store.userId,
  }), [questions, store.attempts, store.cards, store.settings.subjectIds, store.userId]);
  const track = tracks.find((candidate) => candidate.subjectId === chosenSubject) ?? tracks[0];
  const path = track?.topics.find((topic) => topic.topicId === chosenTopic) ?? track?.topics[0];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wide text-ink3">WJEC A Level</p>
        <h1 className="text-xl font-semibold mt-1">Practical-topic pathways</h1>
        <p className="text-sm text-ink3 mt-2">Follow method → errors and uncertainty → graphs and conclusions for Biology, Chemistry or Physics. These are routes through the existing curriculum, not an official required-practical checklist or evidence that a lab practical was completed.</p>
        <p className="text-xs text-ink3 mt-2">Questions may be unreviewed. Recorded practice is not an approved assessment, mastery claim or proof of improvement. Check your teacher&apos;s practical list and current specification for required work and safe laboratory procedures.</p>
      </header>

      <div role="status" aria-live="polite" className="text-sm text-ink3">
        {bankState === "loading" ? "Loading available question prompts; the lesson pathways are already available." : bankState === "unavailable" ? "The current question bank could not be loaded. Available profile questions and lessons still work; no missing skill questions are invented." : "Available question prompts loaded. Skill links use prompt wording, not official practical certification."}
      </div>
      {bankState === "unavailable" ? <Button onClick={() => { setBankState("loading"); setReload((value) => value + 1); }}>Retry question bank</Button> : null}

      {!track ? <Panel>
        <h2 className="text-sm font-semibold">No supported practical subject selected</h2>
        <p className="text-sm text-ink3 mt-2">This track currently covers WJEC A-level Biology, Chemistry and Physics only. GCSE and other boards are not silently treated as the same qualification.</p>
        <ButtonLink href="/settings" className="mt-3">Choose subjects in Settings</ButtonLink>
        <Link href="/technique" className="block min-h-11 mt-2 underline text-sm">Practise generic exam technique instead</Link>
      </Panel> : <>
        <Panel>
          <label htmlFor="practical-subject" className="block font-semibold text-sm">Choose a WJEC A-level subject</label>
          <select id="practical-subject" value={track.subjectId} onChange={(event) => { setChosenSubject(event.target.value); setChosenTopic(""); }} className="w-full rounded-lg bg-surface border border-line p-3 mt-2 text-sm">
            {tracks.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName} — {subject.qualification}</option>)}
          </select>
          <h2 className="text-sm font-semibold mt-4">Choose a practical-related curriculum topic</h2>
          <div role="group" aria-label="Practical-related topics" className="flex flex-wrap gap-2 mt-2">
            {track.topics.map((topic) => <Button key={topic.topicId} aria-pressed={path?.topicId === topic.topicId} variant={path?.topicId === topic.topicId ? "primary" : "secondary"} onClick={() => setChosenTopic(topic.topicId)}>{topic.title}</Button>)}
          </div>
          {!track.topics.length ? <p className="text-sm text-ink3 mt-2">No matching curriculum topics are installed for this subject.</p> : null}
        </Panel>

        {path ? <>
          <Panel>
            <p className="text-xs text-ink3">{track.subjectName} · {track.qualification}{path.specRef ? ` · Curriculum reference: ${path.specRef}` : ""}</p>
            <h2 className="text-base font-semibold mt-1">{path.title}</h2>
            <p className="text-sm text-ink3 mt-2">Recorded activity for this topic: {path.attemptCount} question attempts and {path.reviewedCardCount} cards with a review recorded. Counts may grow as older local history loads; they are not a completion score.</p>
            <ButtonLink href={path.lessonHref} className="mt-3">Open the topic lesson</ButtonLink>
          </Panel>
          <ol aria-label={`${path.title} learning path`} className="space-y-4">
            {path.stages.map((stage) => <li key={stage.id}>
              <Panel as="div">
                <h3 className="text-sm font-semibold">{stage.title}</h3>
                <p className="text-sm text-ink3 mt-2">{stage.task}</p>
                <p className="text-xs text-ink3 mt-2">{stage.attemptCount} attempts on linked prompts · {stage.reviewedCardCount} reviewed cards mentioning this skill</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <ButtonLink href={stage.lessonHref}>Study {stage.id === "uncertainty" ? "errors and uncertainty" : stage.id}</ButtonLink>
                  {stage.practiceHref ? <ButtonLink href={stage.practiceHref} variant="primary">Open a {stage.id} practice question</ButtonLink> : <Link href="/technique" className="inline-flex items-center min-h-11 underline text-sm">Practise response structure</Link>}
                </div>
                <p className="text-xs text-ink3 mt-2">{stage.practiceHref ? `${stage.questionCount} available prompts mention this skill. Check the actual question; the wording match is a navigation aid, not a validated skill assessment.` : "No available prompt matches this skill for this topic. Use the linked lesson and make your own plan; there is no empty question-filter link."}</p>
              </Panel>
            </li>)}
          </ol>
        </> : null}
      </>}
    </div>
  );
}
