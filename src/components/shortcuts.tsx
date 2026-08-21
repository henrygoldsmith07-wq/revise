"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { Button, cx } from "./ui";

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
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [sets, setSets] = useState<Shortcut[][]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const registry = useMemo<ShortcutRegistry>(() => {
    const flat = sets.flat();
    return {
      all: flat,
      openHelp: () => setHelpOpen(true),
      register(shortcuts) {
        setSets((prev) => [...prev, shortcuts]);
        return () => setSets((prev) => prev.filter((s) => s !== shortcuts));
      },
    };
  }, [sets]);

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

function ShortcutHelp({ shortcuts, onClose }: { shortcuts: Shortcut[]; onClose: () => void }) {
  const dialogRef = useFocusTrap(true, onClose);
  const groups = useMemo(() => {
    const map = new Map<string, Shortcut[]>();
    for (const shortcut of shortcuts) {
      const list = map.get(shortcut.group) ?? [];
      // A screen can register the same key twice across remounts; show it once.
      if (!list.some((s) => s.key === shortcut.key && s.label === shortcut.label)) list.push(shortcut);
      map.set(shortcut.group, list);
    }
    return [...map.entries()];
  }, [shortcuts]);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-help-title"
      tabIndex={-1}
    >
      <div
        className="card elev-pop w-full max-w-2xl max-h-[80vh] overflow-y-auto nice-scroll fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
          <h2 id="shortcut-help-title" className="text-sm font-semibold">Keyboard shortcuts</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink3">Esc to close · ? to reopen</span>
            <Button size="sm" variant="ghost" type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="p-5 grid sm:grid-cols-2 gap-x-8 gap-y-5">
          {groups.map(([group, list]) => (
            <div key={group}>
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">{group}</p>
              <ul className="space-y-1.5">
                {list.map((shortcut) => (
                  <li
                    key={`${shortcut.key}:${shortcut.label}`}
                    className={cx("flex items-baseline justify-between gap-3 text-sm", shortcut.disabled && "opacity-40")}
                  >
                    <span className="text-ink2">{shortcut.label}</span>
                    <kbd className="shrink-0 text-[11px] font-mono px-1.5 py-0.5 rounded border border-line bg-surface2 text-ink2">
                      {formatShortcut(shortcut)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!groups.length ? (
            <p className="text-sm text-ink3">No shortcuts are active on this screen.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
