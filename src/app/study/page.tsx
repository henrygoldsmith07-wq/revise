"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { browse } from "@/domain/browser";
import { isDiagramCard } from "@/domain/diagrams";
import { isTextCard } from "@/domain/card-display";
import { allTopics, getSubject, topicsFor } from "@/domain/curriculum";
import type { StudyMode } from "@/domain/study-modes";
import { useStoreFields, useSubjects } from "@/state/store";
import type { Card } from "@/domain/types";
import { DiagramMode } from "@/components/modes/DiagramMode";
import { LearnMode } from "@/components/modes/LearnMode";
import { MatchGame } from "@/components/modes/MatchGame";
import { TestMode } from "@/components/modes/TestMode";
import { AudioMode } from "@/components/modes/AudioMode";
import { ExplanationMode } from "@/components/modes/ExplanationMode";
import { SubjectPicker } from "@/components/SubjectPicker";
import { Button, ButtonLink, EmptyState, Panel, Pill, SectionHeading, cx } from "@/components/ui";
import { ICON_SIZE, ModesIcon } from "@/components/icons";
import { DailySessionCard } from "@/components/DailySessionCard";
import type { LucideIcon } from "@/components/icons";
import { AudioIcon, PracticeIcon, ReviewIcon, TodayIcon, TutorIcon } from "@/components/icons";

// ---------------------------------------------------------------------------
// One deck, six ways to work it. The picker exists because the right mode
// depends on where the student is: match when the material is brand new and
// nothing sticks, learn when it half-sticks, test when they think it is done,
// diagram and audio when the content demands it.
// ---------------------------------------------------------------------------

const MODES: {
  mode: StudyMode;
  label: string;
  blurb: string;
  when: string;
  Icon: LucideIcon;
}[] = [
  {
    mode: "learn",
    label: "Learn",
    blurb: "Multiple choice first, then type it from memory.",
    when: "Best when the material is new and you need it to stick.",
    Icon: TodayIcon,
  },
  {
    mode: "test",
    label: "Test",
    blurb: "A fixed paper, marked only at the end.",
    when: "Best when you think you know it and want proof.",
    Icon: PracticeIcon,
  },
  {
    mode: "match",
    label: "Match",
    blurb: "Pair questions with answers against the clock.",
    when: "Best for making recognition fast and automatic.",
    Icon: ReviewIcon,
  },
  {
    mode: "diagram",
    label: "Label a diagram",
    blurb: "Retrieve each label, then tap the right point.",
    when: "For the figures examiners keep asking you to label from memory.",
    Icon: ModesIcon,
  },
  {
    mode: "audio",
    label: "Listen",
    blurb: "Cards read aloud, hands-free.",
    when: "For revising while walking, on a bus, or resting your eyes.",
    Icon: AudioIcon,
  },
  {
    mode: "explanation",
    label: "Explain mastery",
    blurb: "Teach a topic from memory, then check the ideas you included.",
    when: "Best for proving you can connect the topic without prompts.",
    Icon: TutorIcon,
  },
];

export default function StudyPage() {
  return (
    <Suspense fallback={null}>
      <Study />
    </Suspense>
  );
}

function Study() {
  const params = useSearchParams();
  const store = useStoreFields("adaptiveSession", "cards", "clearRevisionCheckpoint", "revisionCheckpoint", "saveRevisionCheckpoint", "settings");
  const { saveRevisionCheckpoint, clearRevisionCheckpoint } = store;
  const subjects = useSubjects();
  const subjectOptions = useMemo(
    () => [
      { id: "", name: "All subjects", detail: "Every enrolled deck" },
      ...subjects.map((subject) => ({ id: subject.id, name: subject.name, detail: "Subject deck" })),
    ],
    [subjects],
  );
  const resumeRequested = params.get("resume") === "1";
  const savedCheckpoint =
    resumeRequested && store.revisionCheckpoint?.activity === "study" ? store.revisionCheckpoint : null;
  const [resumeQueueIds] = useState<string[] | null>(() => savedCheckpoint?.queueIds ?? null);

  // An unknown ?mode= used to blank the whole page; only accept known modes.
  const requestedMode = params.get("mode");
  const [mode, setMode] = useState<StudyMode | null>(
    MODES.some((m) => m.mode === requestedMode) ? (requestedMode as StudyMode) : null,
  );
  const [subjectId, setSubjectId] = useState(params.get("subject") ?? "");
  const [topicId, setTopicId] = useState(params.get("topic") ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  // The daily session is the default; the six mode cards sit behind "More".
  const [moreOpen, setMoreOpen] = useState(false);

  const pool = useMemo(() => {
    const scoped = store.cards.filter(
      (c) => store.settings.subjectIds.includes(c.subjectId) && !c.suspended,
    );
    return browse(scoped, {
      query,
      subjectIds: subjectId ? [subjectId] : undefined,
      topicIds: topicId ? [topicId] : undefined,
    }).cards;
  }, [store.cards, store.settings.subjectIds, query, subjectId, topicId]);

  const diagramCount = useMemo(() => pool.filter(isDiagramCard).length, [pool]);
  const topicPool = useMemo(() => {
    const scoped = subjectId ? topicsFor(subjectId) : allTopics(store.settings.subjectIds);
    return topicId ? scoped.filter((topic) => topic.id === topicId) : scoped;
  }, [subjectId, topicId, store.settings.subjectIds]);

  const cards = store.cards;

  const activePool = useMemo(() => {
    if (!resumeQueueIds?.length) return pool;
    const byId = new Map(cards.map((card) => [card.id, card] as const));
    const restored = resumeQueueIds.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card));
    return restored.length ? restored : pool;
  }, [pool, resumeQueueIds, cards]);

  // Learn, test, match and audio are text modes: a diagram card's back is an
  // image + hotspot payload, which would surface as raw JSON in a multiple-
  // choice option or a match tile. Diagram cards belong to "Label a diagram".
  const textPool = useMemo(() => activePool.filter(isTextCard), [activePool]);

  const checkpointHref = useMemo(() => {
    const next = new URLSearchParams();
    if (mode) next.set("mode", mode);
    if (subjectId) next.set("subject", subjectId);
    if (topicId) next.set("topic", topicId);
    if (query) next.set("q", query);
    next.set("resume", "1");
    return `/study?${next.toString()}`;
  }, [mode, query, subjectId, topicId]);

  useEffect(() => {
    if (!mode) {
      if (resumeRequested) void clearRevisionCheckpoint();
      return;
    }
    void saveRevisionCheckpoint({
      activity: "study",
      title: `${mode[0].toUpperCase()}${mode.slice(1)} mode`,
      href: checkpointHref,
      position: 0,
      total: activePool.length,
      queueIds: activePool.map((card) => card.id),
    });
  }, [activePool, checkpointHref, clearRevisionCheckpoint, mode, resumeRequested, saveRevisionCheckpoint]);

  if (mode) {
    const exit = () => {
      void clearRevisionCheckpoint();
      setMode(null);
    };
    return (
      <div className="pb-4">
        {mode === "learn" ? <LearnMode cards={textPool} onExit={exit} /> : null}
        {mode === "test" ? <TestMode cards={textPool} onExit={exit} /> : null}
        {mode === "match" ? <MatchGame cards={textPool} onExit={exit} /> : null}
        {mode === "diagram" ? <DiagramMode cards={activePool} onExit={exit} /> : null}
        {mode === "audio" ? <AudioMode cards={textPool} onExit={exit} /> : null}
        {mode === "explanation" ? (
          <ExplanationMode topics={topicPool} initialTopicId={topicId || undefined} onExit={exit} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] uppercase tracking-[0.13em] text-ink3 font-bold">Learn</p>
        <h1 className="text-xl font-semibold tracking-tight mt-1">Choose how to study</h1>
        <p className="text-sm text-ink3 mt-0.5">
          Revise normally picks the method for you from your answers. Use this page when you want to pick it yourself.
        </p>
      </header>

      {store.adaptiveSession ? (
        <Panel className="space-y-2 border-accent">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Recommended</p>
          <p className="text-base font-medium text-ink">Let Revise choose: {store.adaptiveSession.topicTitle}</p>
          <p className="text-sm text-ink2">It mixes recall, exam-style questions and fixes for your mistakes in the order your evidence needs, then checks again in a few days.</p>
          <ButtonLink href={store.adaptiveSession.startHref} variant="primary" className="w-full sm:w-auto min-h-11">Start the recommended session</ButtonLink>
        </Panel>
      ) : null}

      <DailySessionCard subjectIds={store.settings.subjectIds} />

      <div>
        <Button variant="ghost" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
          {moreOpen ? "Hide other ways to study" : "More ways to study"}
        </Button>
      </div>

      {moreOpen ? (
        <>
      <Panel className="space-y-3">
        <SectionHeading title="What are you studying?" hint={`${pool.length} cards selected`} />
        <SubjectPicker
          options={subjectOptions}
          selectedIds={[subjectId]}
          onChange={(ids) => {
            setSubjectId(ids[0] ?? "");
            setTopicId("");
          }}
          selectionMode="single"
          ariaLabel="Subject"
          density="compact"
        />
        <div className="flex flex-wrap gap-2">
          {subjectId ? (
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="field field-inline text-sm"
              aria-label="Topic"
            >
              <option value="">All topics</option>
              {topicsFor(subjectId).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Narrow it further — tag:paper-1, is:leech …"
          className="field text-sm"
          aria-label="Filter cards"
        />
        {subjectId ? (
          <p className="text-[11px] text-ink3">{getSubject(subjectId)?.name} · {pool.length} cards in scope</p>
        ) : null}
      </Panel>

      {pool.length ? (
        <ul className="grid sm:grid-cols-2 gap-3">
          {MODES.map((entry) => {
            const unavailable = entry.mode === "diagram" && diagramCount === 0;
            return (
              <Panel as="li" key={entry.mode} className={cx("flex flex-col", unavailable && "opacity-60")}>
                <div className="flex items-center gap-2 mb-1.5">
                  <entry.Icon size={ICON_SIZE.md} aria-hidden className="text-ink3" />
                  <p className="text-sm font-semibold text-ink">{entry.label}</p>
                  {entry.mode === "diagram" && diagramCount > 0 ? <Pill>{diagramCount}</Pill> : null}
                </div>
                <p className="text-sm text-ink2">{entry.blurb}</p>
                <p className="text-[11px] text-ink3 mt-1 flex-1">{entry.when}</p>
                <Button
                  variant="primary"
                  className="w-full mt-3"
                  disabled={unavailable}
                  onClick={() => setMode(entry.mode)}
                >
                  {unavailable ? "No diagram cards yet" : `Start ${entry.label.toLowerCase()}`}
                </Button>
              </Panel>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="Nothing in this selection"
          body="No cards match this filter, so there is nothing to study in this way yet."
          why="Every method here works from your cards."
          after="Widen the filter, or add cards from your notes, and the methods unlock."
          action={<Button onClick={() => { setQuery(""); setSubjectId(""); setTopicId(""); }}>Clear filter</Button>}
        />
      )}
        </>
      ) : null}
    </div>
  );
}
