"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { preloadWhenIdle } from "./preloadWhenIdle";

// The help sheet is a modal nobody needs on first paint; keep Base UI out of
// the shell bundle and fetch it once the page is idle.
const loadShortcutHelp = () => import("./ShortcutHelp");
const ShortcutHelp = dynamic(loadShortcutHelp, { ssr: false });

// ---------------------------------------------------------------------------
// Keyboard shortcuts.
//
// Two rules make this safe rather than infuriating:
//
// 1. Nothing fires while the user is typing. A review-grading "1" landing in a
//    card editor would be a data-loss bug, so any keypress inside an input,
//    textarea or contenteditable is ignored unless the binding explicitly opts
//    in with `allowInInput`.
// 2. Every binding registers its own help text, so `?` always lists exactly
//    what is live on the current screen — the help can never drift from the
//    behaviour because it *is* the behaviour.
// ---------------------------------------------------------------------------

export interface Shortcut {
  /** Lower-case key, e.g. "s", "?", "arrowdown", " ". */
  key: string;
  meta?: boolean;
  shift?: boolean;
  /** Grouping in the help sheet. */
  group: string;
  label: string;
  run: () => void;
  allowInInput?: boolean;
  /** Temporarily inert bindings still appear in help, greyed out. */
  disabled?: boolean;
}

interface ShortcutRegistry {
  register(shortcuts: Shortcut[]): () => void;
  all: Shortcut[];
  openHelp(): void;
}

const ShortcutContext = createContext<ShortcutRegistry | null>(null);

export function useShortcutRegistry(): ShortcutRegistry {
  const registry = useContext(ShortcutContext);
  if (!registry) throw new Error("useShortcuts must be used inside <ShortcutProvider>");
  return registry;
}

/** Register shortcuts for as long as the calling component is mounted. */
export function useShortcuts(shortcuts: Shortcut[], deps: unknown[] = []) {
  const registry = useShortcutRegistry();
  const latest = useRef(shortcuts);
  // Kept current in an effect: handlers fire long after render, and they must
  // see the latest closures rather than the ones captured at registration.
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    // Registered by a stable proxy so re-registering on every render — which
    // would thrash the registry — is unnecessary.
    return registry.register(
      latest.current.map((shortcut, index) => ({
        ...shortcut,
        run: () => latest.current[index]?.run(),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  // Nothing can be typed into a checkbox, radio or button, so shortcuts stay
  // live after ticking one (the reviewer portal's 1–6 then A flow).
  if (target instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit", "reset"].includes(target.type)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [sets, setSets] = useState<Shortcut[][]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  // `register` must be identity-stable for the lifetime of the provider: it is
  // captured by every registration effect through whatever registry object was
  // current when the effect last ran. If it changed with `sets`, a register →
  // state → re-render cascade could re-run consumers' effects and recurse
  // ("Maximum update depth exceeded"). Functional updates make it loop-free.
  const register = useCallback((shortcuts: Shortcut[]) => {
    setSets((prev) => [...prev, shortcuts]);
    return () => setSets((prev) => prev.filter((s) => s !== shortcuts));
  }, []);

  const registry = useMemo<ShortcutRegistry>(
    () => ({
      all: sets.flat(),
      openHelp: () => setHelpOpen(true),
      register,
    }),
    [register, sets],
  );

  useEffect(() => preloadWhenIdle(loadShortcutHelp), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }
      // `?` is global and always available, so help is reachable from anywhere.
      if (key === "?" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      const typing = isTypingTarget(event.target);
      // Later registrations win: a modal's bindings shadow the page beneath it.
      for (const shortcut of [...sets.flat()].reverse()) {
        if (shortcut.disabled) continue;
        if (shortcut.key.toLowerCase() !== key) continue;
        if (Boolean(shortcut.meta) !== (event.metaKey || event.ctrlKey)) continue;
        if (Boolean(shortcut.shift) !== event.shiftKey) continue;
        if (typing && !shortcut.allowInInput) continue;
        event.preventDefault();
        shortcut.run();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sets, helpOpen]);

  return (
    <ShortcutContext.Provider value={registry}>
      {children}
      {helpOpen ? <ShortcutHelp shortcuts={registry.all} onClose={() => setHelpOpen(false)} /> : null}
    </ShortcutContext.Provider>
  );
}

export function formatShortcut(shortcut: Shortcut): string {
  const parts: string[] = [];
  if (shortcut.meta) parts.push("⌘");
  if (shortcut.shift) parts.push("⇧");
  const key = shortcut.key === " " ? "Space" : shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(key.replace(/^arrow/i, "").replace(/^(up|down|left|right)$/i, (m) => m));
  return parts.join(" ");
}
