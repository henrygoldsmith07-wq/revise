"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { allTopics, topicsFor } from "@/domain/curriculum";
import { materialiseDeck } from "@/domain/deck-io";
import { decodeDeckFromLink } from "@/domain/sharing";
import type { DeckExport } from "@/domain/types";
import { useStore, useSubjects } from "@/state/store";
import { RichText } from "@/components/RichText";
import { Button, EmptyState, Field, Panel, Pill, SectionHeading } from "@/components/ui";

// The receiving end of a shared link. The deck lives in the URL fragment,
// which the browser never sends to a server — so opening someone's link
// reveals nothing to anyone, and works with the app installed and offline.

export default function SharedDeckPage() {
  const router = useRouter();
  const store = useStore();
  const subjects = useSubjects();

  // Read the fragment once, lazily, during the first render. An effect would
  // set state a frame later and flash the "nothing to import" state first.
  const [deck] = useState<DeckExport | null>(() => {
    if (typeof window === "undefined") return null;
    const fragment = window.location.hash.replace(/^#/, "");
    return fragment ? decodeDeckFromLink(fragment) : null;
  });
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState(topicsFor(subjects[0]?.id ?? "")[0]?.id ?? "");
  const [saved, setSaved] = useState<number | null>(null);

  const knownTopicIds = useMemo(() => new Set(allTopics().map((t) => t.id)), []);
  const existingFronts = useMemo(
    () => new Set(store.cards.map((c) => c.front.trim().toLowerCase())),
    [store.cards],
  );

  const preview = useMemo(() => {
    if (!deck) return null;
    return materialiseDeck(deck, {
      userId: store.userId,
      fallbackSubjectId: subjectId,
      fallbackTopicId: topicId,
      knownTopicIds,
      existingFronts,
      keepScheduling: false,
      extraTags: ["shared"],
    });
  }, [deck, store.userId, subjectId, topicId, knownTopicIds, existingFronts]);

  async function keep() {
    if (!preview?.cards.length) return;
    await store.addCards(preview.cards);
    setSaved(preview.cards.length);
    // Clear the fragment so a refresh does not offer the same import again.
    history.replaceState(null, "", "/shared");
  }

  if (!deck) {
    return (
      <EmptyState
        title="Nothing to import"
        body="This link does not carry a deck. Ask whoever sent it to share the file instead — links have a size limit, so larger decks travel as files."
        action={<Button onClick={() => router.push("/cards")}>Go to my cards</Button>}
      />
    );
  }

  if (saved != null) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Panel>
          <p className="text-sm font-semibold text-success">{saved} cards added.</p>
          <p className="text-xs text-ink3 mt-1">
            Tagged “shared”, and due immediately. They start with no scheduling history — whoever shared them
            cannot tell you how well you know them.
          </p>
        </Panel>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => router.push("/review")}>
            Start reviewing
          </Button>
          <Button className="flex-1" onClick={() => router.push("/cards?q=tag%3Ashared")}>
            See them
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{deck.name}</h1>
        <p className="text-sm text-ink3 mt-0.5">
          Someone shared {deck.cards.length} cards with you. Nothing is saved until you choose to keep them.
        </p>
      </header>

      <Panel className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Pill>{deck.cards.length} cards</Pill>
          {preview?.duplicates ? <Pill tone="review">{preview.duplicates} you already have</Pill> : null}
          <Pill>No scheduling history</Pill>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Add to subject">
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTopicId(topicsFor(e.target.value)[0]?.id ?? "");
              }}
              className="field text-sm"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Topic">
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="field text-sm">
              {topicsFor(subjectId).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Button
          variant="primary"
          className="w-full min-h-[3rem]"
          onClick={() => void keep()}
          disabled={!preview?.cards.length}
        >
          Keep {preview?.cards.length ?? 0} cards
        </Button>
      </Panel>

      <SectionHeading title="What is in it" hint="Every card, before you decide." />
      <ul className="card divide-y divide-line cv-list">
        {deck.cards.slice(0, 60).map((card, i) => (
          <li key={i} className="px-4 py-2.5">
            <RichText className="text-sm text-ink line-clamp-2">{card.front}</RichText>
            <RichText className="text-xs text-ink3 line-clamp-2 mt-0.5">{card.back}</RichText>
          </li>
        ))}
      </ul>
      {deck.cards.length > 60 ? (
        <p className="text-xs text-ink3 text-center">…and {deck.cards.length - 60} more.</p>
      ) : null}
    </div>
  );
}
