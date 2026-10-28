"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { seedMisconceptions } from "@/content/misconceptions";
import { allTopics } from "@/domain/curriculum";
import { buildSearchIndex, searchIndex } from "@/domain/search";
import type { SearchResult } from "@/domain/search";
import { useStoreFields } from "@/state/store";
import { Modal } from "./Modal";
import { cx, Pill } from "./ui";

/** Escape a string for use inside a CSS attribute/id selector. */
function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}


/** ⌘K search across topics, cards, questions and misconceptions. Runs
 *  locally, so it works offline and returns within a keystroke. */
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { cards, questions, settings } = useStoreFields("cards", "questions", "settings");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  // Indexed once per corpus change so each keystroke is a scan of prepared
  // strings rather than a re-lower-casing of the whole deck.
  const index = useMemo(
    () =>
      buildSearchIndex({
        topics: allTopics(settings.subjectIds),
        cards,
        questions,
        misconceptions: seedMisconceptions.filter((m) => settings.subjectIds.includes(m.subjectId)),
      }),
    [cards, questions, settings.subjectIds],
  );
  const results = useMemo(() => searchIndex(index, query, 20), [index, query]);

  // Keyboard focus must follow the highlight: with 20 options in a scrolling
  // list, arrowing past the fold selected an option the student could not see.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLButtonElement>(`#search-result-${cssEscape(results[cursor]?.id ?? "")}`);
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor, results]);

  const open = (result: SearchResult) => {
    onClose();
    if (result.kind === "question") router.push(`/practice?question=${encodeURIComponent(result.id)}`);
    else if (result.kind === "card") router.push(`/review?topic=${encodeURIComponent(result.topicId ?? "")}`);
    else if (result.kind === "misconception")
      router.push(
        `/library?topic=${encodeURIComponent(result.topicId ?? "")}&misconception=${encodeURIComponent(result.id)}`,
      );
    else router.push(`/library?topic=${encodeURIComponent(result.id)}`);
  };

  return (
    <Modal onClose={onClose} label="Search" align="top" initialFocus={inputRef} className="card elev-pop max-w-xl overflow-hidden">
      <div className="flex items-center border-b border-line">
        <input
          ref={inputRef}
          id={inputId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Reset the highlight with the query, in the same event, so the
            // list never renders with a cursor pointing past its own end.
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && results.length) {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            }
            if (e.key === "ArrowUp" && results.length) {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === "Enter" && results[cursor]) open(results[cursor]);
          }}
          placeholder="Search topics, cards, questions and misconceptions…"
          className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm outline-none"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={query.length >= 2 && results.length > 0}
          aria-haspopup="listbox"
          aria-label="Search query"
          aria-controls="search-results"
          aria-activedescendant={
            results[cursor] ? `search-result-${results[cursor].kind}-${results[cursor].id}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" onClick={onClose} className="btn btn-ghost mr-2 text-xs" aria-label="Close search">
          Close
        </button>
      </div>
      <ul id="search-results" ref={listRef} className="max-h-[60vh] overflow-y-auto nice-scroll cv-list" role="listbox" aria-label="Search results">
        {results.map((result, i) => (
          <li key={`${result.kind}:${result.id}`} role="presentation">
            <button
              type="button"
              id={`search-result-${result.kind}-${result.id}`}
              role="option"
              aria-selected={i === cursor}
              aria-label={`${result.kind}: ${result.title}`}
              onClick={() => open(result)}
              onMouseEnter={() => setCursor(i)}
              className={cx(
                "w-full text-left px-4 py-2.5 border-b border-line last:border-0",
                i === cursor && "bg-surface2",
              )}
            >
              <div className="flex items-start gap-2">
                <Pill className="mt-0.5 shrink-0">{result.kind}</Pill>
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{result.title}</p>
                  <p className="text-xs text-ink3 truncate">{result.snippet}</p>
                </div>
              </div>
            </button>
          </li>
        ))}
        {query.length >= 2 && !results.length ? (
          <li className="px-4 py-6 text-center text-sm text-ink3" role="status" aria-live="polite">
            Nothing matches “{query}”.
          </li>
        ) : null}
        {query.length < 2 ? (
          <li className="px-4 py-5" role="presentation">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Try</p>
            <div className="flex flex-wrap gap-1.5">
              {["photosynthesis", "moles", "momentum", "enzymes", "integration"].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuery(suggestion);
                    setCursor(0);
                  }}
                  className="pill hover:border-ink3 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink3 mt-3">
              {index.docs.length} items indexed on this device — search works offline.
            </p>
          </li>
        ) : null}
      </ul>
    </Modal>
  );
}
