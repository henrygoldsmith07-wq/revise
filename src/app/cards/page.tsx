"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { browse, easeFactor, SAVED_SEARCHES, sortCards, tagCounts } from "@/domain/browser";
import type { SortKey } from "@/domain/browser";
import { cardState } from "@/domain/card-stats";
import { getSubject, getTopic, topicsFor } from "@/domain/curriculum";
import { buryCard, createCard, isDue, setSuspended, todayIso, unburyCard } from "@/domain/scheduling";
import type { Card } from "@/domain/types";
import { useStore, useSubjects } from "@/state/store";
import { BulkActions } from "@/components/BulkActions";
import { applyDraft, CardEditor, draftFromCard } from "@/components/CardEditor";
import type { CardDraft } from "@/components/CardEditor";
import { CardStatsPanel, DeckStatsPanel } from "@/components/CardStatsPanel";
import { CustomStudyDialog } from "@/components/CustomStudyDialog";
import { deckNameFor, ExportDeckPanel, ImportDeckPanel } from "@/components/DeckIO";
import { ShareDeck } from "@/components/ShareDeck";
import { useShortcuts } from "@/components/shortcuts";
import { RichText } from "@/components/RichText";
import { Button, ButtonLink, EmptyState, Pill, SectionHeading, Segmented, cx } from "@/components/ui";
import { BackIcon, ICON_SIZE, SearchIcon } from "@/components/icons";

// ---------------------------------------------------------------------------
// The card browser: the screen that makes a 500-card deck manageable. Search,
// filter, select, edit in bulk, inspect one card's history, import and export.
//
// It is deliberately keyboard-first — anyone who needs a browser at all is
// doing maintenance, and maintenance by mouse is slow.
// ---------------------------------------------------------------------------

type Pane = "browse" | "stats" | "io";

export default function CardsPage() {
  return (
    <Suspense fallback={null}>
      <CardBrowser />
    </Suspense>
  );
}

function CardBrowser() {
  const params = useSearchParams();
  const store = useStore();
  const subjects = useSubjects();
  const today = todayIso();

  const [pane, setPane] = useState<Pane>("browse");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [subjectId, setSubjectId] = useState(params.get("subject") ?? "");
  const [topicId, setTopicId] = useState(params.get("topic") ?? "");
  const [sort, setSort] = useState<SortKey>("due");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [customStudy, setCustomStudy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const scoped = useMemo(
    () => store.cards.filter((c) => store.settings.subjectIds.includes(c.subjectId)),
    [store.cards, store.settings.subjectIds],
  );

  const { cards: matched, warnings } = useMemo(
    () =>
      browse(scoped, {
        query,
        subjectIds: subjectId ? [subjectId] : undefined,
        topicIds: topicId ? [topicId] : undefined,
      }),
    [scoped, query, subjectId, topicId],
  );

  const results = useMemo(() => sortCards(matched, sort, direction), [matched, sort, direction]);
  const tags = useMemo(() => tagCounts(scoped), [scoped]);
  const selectedCards = useMemo(() => results.filter((c) => selected.has(c.id)), [results, selected]);
  const openCard = useMemo(() => store.cards.find((c) => c.id === openCardId) ?? null, [store.cards, openCardId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEditor(card: Card) {
    setOpenCardId(card.id);
    setDraft(draftFromCard(card));
    setCreating(false);
  }

  function startNewCard() {
    const subject = subjectId || subjects[0]?.id || "";
    const topic = topicId || topicsFor(subject)[0]?.id || "";
    setOpenCardId(null);
    setCreating(true);
    setDraft({ front: "", back: "", kind: "basic", tags: [], note: "", topicId: topic });
  }

  async function saveDraft() {
    if (!draft) return;
    if (creating) {
      const topic = getTopic(draft.topicId);
      await store.addCards([
        applyDraft(
          createCard({
            id: crypto.randomUUID(),
            userId: store.userId,
            subjectId: topic?.subjectId ?? subjectId ?? subjects[0]?.id ?? "",
            topicId: draft.topicId,
            front: draft.front,
            back: draft.back,
            origin: "manual",
          }),
          draft,
        ),
      ]);
    } else if (openCard) {
      await store.updateCards([applyDraft(openCard, draft)]);
    }
    setDraft(null);
    setCreating(false);
    setOpenCardId(null);
  }

  useShortcuts(
    [
      { key: "/", group: "Browser", label: "Focus the search box", run: () => searchRef.current?.focus() },
      { key: "n", group: "Browser", label: "New card", run: startNewCard },
      { key: "a", group: "Browser", label: "Select all results", run: () => setSelected(new Set(results.map((c) => c.id))) },
      { key: "escape", group: "Browser", label: "Clear selection / close editor", allowInInput: true, run: () => {
          if (draft) { setDraft(null); setCreating(false); setOpenCardId(null); }
          else setSelected(new Set());
        } },
      { key: "s", group: "Selection", label: "Suspend selected", run: () => void store.updateCards(selectedCards.map((c) => setSuspended(c, true))) },
      { key: "b", group: "Selection", label: "Bury selected until tomorrow", run: () => void store.updateCards(selectedCards.map((c) => buryCard(c))) },
      { key: "u", group: "Selection", label: "Unsuspend and unbury selected", run: () => void store.updateCards(selectedCards.map((c) => unburyCard(setSuspended(c, false)))) },
      { key: "c", group: "Browser", label: "Build a custom study session", run: () => setCustomStudy(true) },
    ],
    [results, selectedCards, draft, subjects, subjectId, topicId],
  );

  if (draft) {
    return (
      <div className="space-y-5 max-w-3xl">
        <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setCreating(false); setOpenCardId(null); }}>
          <BackIcon size={ICON_SIZE.sm} aria-hidden />
          Back to browser
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{creating ? "New card" : "Edit card"}</h1>
        <CardEditor
          draft={draft}
          subjectId={getTopic(draft.topicId)?.subjectId ?? subjectId ?? subjects[0]?.id ?? ""}
          onChange={setDraft}
          onSave={() => void saveDraft()}
          onCancel={() => { setDraft(null); setCreating(false); setOpenCardId(null); }}
          saveLabel={creating ? "Create card" : "Save changes"}
        />
        {openCard ? (
          <section>
            <SectionHeading title="This card's history" hint="Ease, lapses and every review it has had." />
            <CardStatsPanel card={openCard} logs={store.reviewLogs} />
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cards</h1>
          <p className="text-sm text-ink3 mt-0.5">
            {scoped.length} cards · press <kbd className="text-[10px]">?</kbd> for shortcuts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/study?q=${encodeURIComponent(query)}${subjectId ? `&subject=${subjectId}` : ""}`} size="sm">
            Study these
          </ButtonLink>
          <Button size="sm" onClick={() => setCustomStudy(true)}>Custom study</Button>
          <Button size="sm" variant="primary" onClick={startNewCard}>New card</Button>
        </div>
      </header>

      <Segmented
        ariaLabel="View"
        value={pane}
        onChange={setPane}
        options={[
          { value: "browse", label: "Browse" },
          { value: "stats", label: "Statistics" },
          { value: "io", label: "Import / export" },
        ]}
      />

      {pane === "stats" ? (
        <>
          <SectionHeading title="Deck statistics" hint={`Across the ${matched.length} cards matching your filter.`} />
          <DeckStatsPanel cards={matched} logs={store.reviewLogs} />
        </>
      ) : null}

      {pane === "io" ? (
        <div className="space-y-4 max-w-2xl">
          <ImportDeckPanel />
          <ShareDeck cards={matched} name={deckNameFor(getSubject(subjectId)?.name, query)} />
          <ExportDeckPanel cards={matched} defaultName={deckNameFor(getSubject(subjectId)?.name, query)} />
        </div>
      ) : null}

      {pane === "browse" ? (
        <>
          <div className="space-y-2">
            <div className="relative">
              <SearchIcon
                size={ICON_SIZE.md}
                aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="tag:paper-1 is:due prop:lapses>3 …"
                aria-label="Search cards"
                className="field field-search text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SAVED_SEARCHES.map((saved) => (
                <button
                  key={saved.query}
                  type="button"
                  onClick={() => setQuery(saved.query)}
                  title={saved.hint}
                  className={cx("pill hover:border-ink3 transition-colors", query === saved.query && "border-ink3 text-ink")}
                >
                  {saved.label}
                </button>
              ))}
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="pill text-ink3 hover:text-ink">
                  Clear
                </button>
              ) : null}
            </div>

            {tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.slice(0, 14).map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setQuery(query.includes(`tag:${tag}`) ? query.replace(`tag:${tag}`, "").trim() : `${query} tag:${tag}`.trim())}
                    className={cx("pill hover:border-ink3 transition-colors", query.includes(`tag:${tag}`) && "bg-accent text-onaccent border-transparent")}
                  >
                    {tag} <span className="opacity-60">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(""); }} className="field field-inline text-sm" aria-label="Subject">
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {subjectId ? (
                <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="field field-inline text-sm" aria-label="Topic">
                  <option value="">All topics</option>
                  {topicsFor(subjectId).map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              ) : null}
              <select
                value={`${sort}:${direction}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  setSort(key as SortKey);
                  setDirection(dir as "asc" | "desc");
                }}
                className="field field-inline text-sm"
                aria-label="Sort"
              >
                <option value="due:asc">Due first</option>
                <option value="added:desc">Newest added</option>
                <option value="lapses:desc">Most lapses</option>
                <option value="reps:desc">Most reviewed</option>
                <option value="difficulty:desc">Hardest</option>
                <option value="front:asc">Alphabetical</option>
                <option value="topic:asc">By topic</option>
              </select>
              <span className="text-xs text-ink3 ml-auto tabular-nums">
                {results.length} of {scoped.length}
              </span>
            </div>

            {warnings.map((warning, i) => (
              <p key={i} className="text-xs text-review">{warning}</p>
            ))}
          </div>

          {results.length ? (
            <>
              <div className="flex items-center gap-2 text-xs text-ink3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === results.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < results.length;
                    }}
                    onChange={(e) => setSelected(e.target.checked ? new Set(results.map((c) => c.id)) : new Set())}
                    className="accent-[var(--accent)]"
                  />
                  Select all
                </label>
              </div>

              <ul className="card divide-y divide-line cv-list">
                {results.slice(0, 300).map((card) => (
                  <li key={card.id} className={cx("flex items-start gap-3 px-3 py-2.5", selected.has(card.id) && "bg-surface2")}>
                    <input
                      type="checkbox"
                      checked={selected.has(card.id)}
                      onChange={() => toggle(card.id)}
                      className="mt-1 accent-[var(--accent)]"
                      aria-label={`Select ${card.front.slice(0, 40)}`}
                    />
                    <button type="button" onClick={() => openEditor(card)} className="min-w-0 flex-1 text-left">
                      <RichText className="text-sm text-ink line-clamp-2">{card.front}</RichText>
                      <p className="text-[11px] text-ink3 mt-0.5 truncate">
                        {getTopic(card.topicId)?.title ?? card.topicId} · due {card.due} · ease{" "}
                        {easeFactor(card).toFixed(2)}
                        {card.lapses ? ` · ${card.lapses} lapses` : ""}
                        {card.tags.length ? ` · ${card.tags.join(" ")}` : ""}
                      </p>
                    </button>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatePill card={card} today={today} />
                    </div>
                  </li>
                ))}
              </ul>
              {results.length > 300 ? (
                <p className="text-xs text-ink3 text-center">
                  Showing the first 300 of {results.length}. Narrow the filter to see the rest.
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="Nothing matches"
              body={
                query
                  ? "No card matches that filter. Try one of the chips above, or clear the search."
                  : "No cards in this scope yet."
              }
              action={query ? <Button onClick={() => setQuery("")}>Clear filter</Button> : undefined}
            />
          )}

          <BulkActions
            selected={selectedCards}
            onDone={() => setSelected(new Set())}
            onExport={(cards) => {
              setPane("io");
              setSelected(new Set(cards.map((c) => c.id)));
            }}
          />
        </>
      ) : null}

      {customStudy ? (
        <CustomStudyDialog cards={scoped} initialQuery={query} onClose={() => setCustomStudy(false)} />
      ) : null}
    </div>
  );
}

function StatePill({ card, today }: { card: Card; today: string }) {
  const state = cardState(card, today);
  if (state === "suspended") return <Pill tone="danger">suspended</Pill>;
  if (state === "buried") return <Pill tone="review">buried</Pill>;
  if (state === "leech") return <Pill tone="danger">leech</Pill>;
  if (isDue(card, today)) return <Pill tone="review">due</Pill>;
  if (state === "mastered") return <Pill tone="success">mastered</Pill>;
  return <Pill>{state}</Pill>;
}
