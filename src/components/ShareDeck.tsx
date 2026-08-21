"use client";

import { useMemo, useState } from "react";
import { exportDeck, serialiseDeck } from "@/domain/deck-io";
import { buildShareLink } from "@/domain/sharing";
import type { Card } from "@/domain/types";
import { Button, Panel, Pill, SectionHeading } from "./ui";
import { ICON_SIZE, ShareIcon } from "./icons";

// Sharing without a server. A link carries the deck in its fragment (never
// sent to any host), and a file goes through the Web Share API on a phone or a
// plain download everywhere else. Shared decks always drop scheduling.

export function ShareDeck({ cards, name }: { cards: Card[]; name: string }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState<string | null>(null);

  const link = useMemo(
    () => (typeof window === "undefined" ? null : buildShareLink(cards, name, window.location.origin)),
    [cards, name],
  );

  async function shareFile() {
    const deck = exportDeck(cards, { name, includeScheduling: false });
    const file = new File([serialiseDeck(deck)], `${slug(name)}.revise.json`, { type: "application/json" });

    // canShare with the actual file: Android Chrome reports share support but
    // refuses JSON attachments, and the download fallback works everywhere.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name, text: `${cards.length} revision cards` });
        setShared("Shared.");
        return;
      } catch {
        // A cancelled share is not an error; fall through to the download.
      }
    }
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
    setShared("Downloaded — send the file however you like.");
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShared("Copying was blocked. Use the file instead.");
    }
  }

  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Share"
        hint={`${cards.length} card${cards.length === 1 ? "" : "s"}. Scheduling is stripped — they start fresh for whoever receives them.`}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void shareFile()} className="min-h-[2.75rem]">
          <ShareIcon size={ICON_SIZE.sm} aria-hidden />
          Share as a file
        </Button>
        <Button onClick={() => void copyLink()} disabled={!link} className="min-h-[2.75rem]">
          {copied ? "Link copied" : "Copy a link"}
        </Button>
      </div>

      {link && !link.withinLimit ? (
        <p className="text-xs text-review">
          Too big for a link — a link would carry only the first {link.cardsIncluded}. Share the file to send all{" "}
          {cards.length}.
        </p>
      ) : link ? (
        <p className="text-[11px] text-ink3">
          The link carries the deck itself, so it never touches a server. {Math.round(link.bytes / 1024)} KB.
        </p>
      ) : null}

      {shared ? <p className="text-xs text-success">{shared}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <Pill>No account needed</Pill>
        <Pill>Works offline</Pill>
      </div>
    </Panel>
  );
}

function slug(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "deck";
}
