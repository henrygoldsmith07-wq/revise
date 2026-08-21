"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { aiExplain, aiGenerateCards, aiSummarise } from "@/ai/client";
import type { ExplainResponse } from "@/ai/types";
import { misconceptionsForTopic } from "@/content";
import { getSubject, getTopic, topicsFor, unitsFor } from "@/domain/curriculum";
import { createCard } from "@/domain/scheduling";
import type { Card, Topic } from "@/domain/types";
import { useStore, useSubjects } from "@/state/store";
import { RichText } from "@/components/RichText";
import { Button, ButtonLink, EmptyState, Field, Panel, Pill, ProgressBar, SectionHeading, Segmented, SourceBadge } from "@/components/ui";
import { BackIcon, CreditedIcon, DeleteIcon, ICON_SIZE, MissedIcon } from "@/components/icons";

// The library is where a topic is *learned* rather than tested: spec content,
// an explanation, and the two buttons that turn reading into revisable
// material. Reading alone changes nothing, so every panel ends in a card, a
// question or a review.

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <Library />
    </Suspense>
  );
}

function Library() {
  const params = useSearchParams();
  const subjects = useSubjects();
  const store = useStore();
  const topicParam = params.get("topic");
  const subjectParam = params.get("subject");
  const misconceptionParam = params.get("misconception");

  const [subjectId, setSubjectId] = useState(
    subjectParam ?? (topicParam ? getTopic(topicParam)?.subjectId : null) ?? subjects[0]?.id ?? "",
  );
  const [topicId, setTopicId] = useState(topicParam ?? "");

  const topic = topicId ? getTopic(topicId) : null;

  if (topic) {
    return <TopicDetail topic={topic} onBack={() => setTopicId("")} highlightMisconceptionId={misconceptionParam ?? ""} />;
  }

  const units = subjectId ? unitsFor(subjectId) : [];
  const masteryById = new Map(store.mastery.map((m) => [m.topicId, m]));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-ink3 mt-0.5">
            Every topic in the specification, with its cards, questions and mastery.
          </p>
        </div>
        {subjects.length > 1 ? (
          <Segmented
            ariaLabel="Subject"
            value={subjectId}
            onChange={setSubjectId}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
          />
        ) : null}
      </header>

      {units.map((unit) => {
        const topics = topicsFor(subjectId).filter((t) => t.unitId === unit.id);
        return (
          <section key={unit.id}>
            <SectionHeading title={unit.title} hint={`${topics.length} topics`} />
            <ul className="card divide-y divide-line cv-list">
              {topics.map((row) => {
                const mastery = masteryById.get(row.id);
                const cards = store.cards.filter((c) => c.topicId === row.id).length;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setTopicId(row.id)}
                      className="w-full text-left px-4 py-3 hover:bg-surface2 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm text-ink truncate">{row.title}</p>
                        <span className="text-[11px] text-ink3 tabular-nums shrink-0">
                          {Math.round((mastery?.mastery ?? 0) * 100)}%
                        </span>
                      </div>
                      <p className="text-[11px] text-ink3 mt-0.5 truncate">
                        {cards} cards
                        {mastery?.cardsDue ? ` · ${mastery.cardsDue} due` : ""} · difficulty{" "}
                        {row.intrinsicDifficulty}/5
                        {row.specRef ? ` · ${row.specRef}` : ""}
                      </p>
                      <div className="mt-1.5">
                        <ProgressBar
                          value={mastery?.mastery ?? 0}
                          tone={
                            (mastery?.mastery ?? 0) >= 0.8
                              ? "success"
                              : (mastery?.mastery ?? 0) >= 0.55
                                ? "accent"
                                : (mastery?.mastery ?? 0) > 0
                                  ? "review"
                                  : "danger"
                          }
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!units.length ? (
        <EmptyState title="No subject selected" body="Choose your subjects in settings to see their curriculum here." />
      ) : null}

      <ManualCard subjectId={subjectId} />
    </div>
  );
}

function TopicDetail({
  topic,
  onBack,
  highlightMisconceptionId,
}: {
  topic: Topic;
  onBack: () => void;
  highlightMisconceptionId?: string;
}) {
  const store = useStore();
  const [explanation, setExplanation] = useState<{
    data: ExplainResponse;
    source: "ai" | "fallback";
    note?: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const cards = useMemo(() => store.cards.filter((c) => c.topicId === topic.id), [store.cards, topic.id]);
  const questions = useMemo(
    () => store.questions.filter((q) => q.topicIds.includes(topic.id)),
    [store.questions, topic.id],
  );
  const misconceptions = useMemo(() => misconceptionsForTopic(topic.id), [topic.id]);
  useEffect(() => {
    if (!highlightMisconceptionId) return;
    document.getElementById(highlightMisconceptionId)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [highlightMisconceptionId]);
  const mastery = store.mastery.find((m) => m.topicId === topic.id);

  async function explain() {
    setBusy("explain");
    const result = await aiExplain(topic.id);
    setExplanation({ data: result.data, source: result.source, note: result.note });
    setBusy(null);
  }

  async function summary() {
    setBusy("summary");
    const result = await aiSummarise(topic.id);
    setExplanation({
      data: { explanation: `${result.data.summary}\n\n${result.data.bullets.map((b) => `- ${b}`).join("\n")}` },
      source: result.source,
      note: result.note,
    });
    setBusy(null);
  }

  async function generate() {
    setBusy("cards");
    const result = await aiGenerateCards(topic.id, 8);
    const existing = new Set(cards.map((c) => c.front.trim()));
    const fresh: Card[] = result.data.cards
      .filter((generated) => !existing.has(generated.front.trim()))
      .map((generated) =>
        createCard({
          id: crypto.randomUUID(),
          userId: store.userId,
          subjectId: topic.subjectId,
          topicId: topic.id,
          front: generated.front,
          back: generated.back,
          kind: generated.kind,
          origin: result.source === "ai" ? "ai" : "seed",
        }),
      );
    await store.addCards(fresh);
    setStatus(
      fresh.length
        ? `Added ${fresh.length} card${fresh.length === 1 ? "" : "s"} — they are due immediately.`
        : "No new cards: everything generated already exists in this deck.",
    );
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <BackIcon size={ICON_SIZE.sm} aria-hidden />
          Library
        </Button>
        <span className="text-xs text-ink3">{getSubject(topic.subjectId)?.name}</span>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">{topic.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {topic.specRef ? <Pill>{topic.specRef}</Pill> : null}
          {topic.specVersion ? <Pill title="Spec version this topic was checked against">{topic.specVersion}</Pill> : null}
          <Pill>Difficulty {topic.intrinsicDifficulty}/5</Pill>
          <Pill>{cards.length} cards</Pill>
          <Pill>{questions.length} questions</Pill>
          {topic.aos?.length ? (
            <Pill tone="accent" title="Assessment objectives">
              {topic.aos.join(" · ")}
            </Pill>
          ) : null}
          <Pill
            tone={topic.verification === "verified" ? "success" : topic.verification === "checked" ? "review" : undefined}
            title={topic.lastChecked ? `Last checked ${topic.lastChecked}` : "Not yet checked against the spec"}
          >
            {topic.source ?? "authored"} · {topic.verification ?? "unverified"}
            {topic.lastChecked ? ` · ${topic.lastChecked}` : ""}
          </Pill>
          {mastery?.cardsDue ? <Pill tone="review">{mastery.cardsDue} due</Pill> : null}
        </div>
        {topic.specPoints?.length ? (
          <div className="mt-3 card-2 card p-3">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Spec coverage</p>
            <ul className="mt-1.5 space-y-1">
              {topic.specPoints.map((point) => (
                <li key={point.ref} className="flex gap-2 text-xs">
                  <span className="font-mono text-ink3 shrink-0">{point.ref}</span>
                  <span className="text-ink2 flex-1">{point.text}</span>
                  <span className="text-ink3 shrink-0">{point.aos.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-3 max-w-sm">
          <ProgressBar value={mastery?.mastery ?? 0} label="Mastery" />
        </div>
      </header>

      <Panel>
        <p className="text-sm text-ink2">{topic.summary}</p>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mt-4 mb-1.5">What earns marks</p>
        <ul className="space-y-1.5">
          {topic.keyPoints.map((point, i) => (
            <li key={i} className="text-sm text-ink2 flex gap-2">
              <CreditedIcon size={ICON_SIZE.md} aria-hidden className="shrink-0 mt-0.5 text-success" />
              <RichText className="flex-1">{point}</RichText>
            </li>
          ))}
        </ul>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mt-4 mb-1.5">
          Where marks are lost
        </p>
        <ul className="space-y-1.5">
          {topic.commonErrors.map((error, i) => (
            <li key={i} className="text-sm text-danger flex gap-2">
              <MissedIcon size={ICON_SIZE.md} aria-hidden className="shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {misconceptions.length ? (
        <section>
          <SectionHeading
            title="Misconception library"
            hint="The wrong belief, why it is wrong, and what to write instead."
          />
          <div className="space-y-3">
            {misconceptions.map((misconception) => (
              <div key={misconception.id} id={misconception.id} className="scroll-mt-24">
                <Panel className={highlightMisconceptionId === misconception.id ? "ring-2 ring-accent" : undefined}>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="danger">Misconception</Pill>
                  {misconception.tag ? <Pill>{misconception.tag}</Pill> : null}
                  {misconception.ao ? <Pill tone="accent">{misconception.ao}</Pill> : null}
                </div>
                <p className="text-sm text-ink font-medium mt-2 flex gap-2">
                  <MissedIcon size={ICON_SIZE.md} aria-hidden className="shrink-0 mt-0.5 text-danger" />
                  <span className="flex-1">{misconception.statement}</span>
                </p>
                <p className="text-xs text-ink3 mt-2">
                  <span className="uppercase tracking-wide font-semibold">What it looks like: </span>
                  {misconception.example}
                </p>
                <p className="text-sm text-ink2 mt-2">{misconception.explanation}</p>
                <p className="text-sm text-ink2 mt-2 flex gap-2">
                  <CreditedIcon size={ICON_SIZE.md} aria-hidden className="shrink-0 mt-0.5 text-success" />
                  <span className="flex-1">{misconception.correction}</span>
                </p>
                </Panel>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void explain()} disabled={busy !== null}>
          {busy === "explain" ? "Thinking…" : "Explain this topic"}
        </Button>
        <Button onClick={() => void summary()} disabled={busy !== null}>
          {busy === "summary" ? "Writing…" : "Revision summary"}
        </Button>
        <Button onClick={() => void generate()} disabled={busy !== null}>
          {busy === "cards" ? "Generating…" : "Generate flashcards"}
        </Button>
        <ButtonLink href={`/practice?topic=${encodeURIComponent(topic.id)}`}>Practise questions</ButtonLink>
        <ButtonLink href={`/review?topic=${encodeURIComponent(topic.id)}`}>Review cards</ButtonLink>
        <ButtonLink href={`/tutor?topic=${encodeURIComponent(topic.id)}`}>Ask the tutor</ButtonLink>
      </div>

      {status ? <p className="text-xs text-ink3">{status}</p> : null}

      {explanation ? (
        <Panel className="fade-in">
          <div className="flex justify-end mb-2">
            <SourceBadge source={explanation.source} note={explanation.note} />
          </div>
          <RichText>{explanation.data.explanation}</RichText>
          {explanation.data.checkQuestion ? (
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">Check yourself</p>
              <RichText className="text-sm">{explanation.data.checkQuestion}</RichText>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <section>
        <SectionHeading title="Cards in this deck" hint="Suspended and mistake cards included." />
        {cards.length ? (
          <ul className="card divide-y divide-line cv-list">
            {cards.slice(0, 40).map((card) => (
              <li key={card.id} className="px-4 py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink line-clamp-2">{card.front}</p>
                  <p className="text-[11px] text-ink3 mt-0.5">
                    {card.kind} · due {card.due} · {card.reps} reviews
                    {card.lapses ? ` · ${card.lapses} lapses` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void store.removeCard(card.id)}
                  aria-label="Delete card"
                >
                  <DeleteIcon size={ICON_SIZE.sm} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No cards yet" body="Generate a deck from this topic's spec content, or write your own." />
        )}
      </section>
    </div>
  );
}

function ManualCard({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const topics = subjectId ? topicsFor(subjectId) : [];
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!front.trim() || !back.trim() || !topicId) return;
    await store.addCards([
      createCard({
        id: crypto.randomUUID(),
        userId: store.userId,
        subjectId,
        topicId,
        front: front.trim(),
        back: back.trim(),
        origin: "manual",
      }),
    ]);
    setFront("");
    setBack("");
    setSaved(true);
  }

  if (!topics.length) return null;

  return (
    <section>
      <SectionHeading title="Write a card" hint="Cloze deletions: wrap the answer in [ ] and it becomes a blank." />
      <Panel className="space-y-3">
        <Field label="Topic">
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="field text-sm">
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Front" hint="A question, not a heading. LaTeX between $ works.">
          <textarea value={front} onChange={(e) => setFront(e.target.value)} rows={2} className="field" />
        </Field>
        <Field label="Back">
          <textarea value={back} onChange={(e) => setBack(e.target.value)} rows={3} className="field" />
        </Field>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => void save()} disabled={!front.trim() || !back.trim()}>
            Add card
          </Button>
          {saved ? <span className="text-xs text-success">Saved — it is due in your next review.</span> : null}
        </div>
      </Panel>
    </section>
  );
}
