"use client";

import { useMemo } from "react";
import { Modal, ModalTitle } from "./Modal";
import { formatShortcut, type Shortcut } from "./shortcuts";
import { Button, cx } from "./ui";

export default function ShortcutHelp({ shortcuts, onClose }: { shortcuts: Shortcut[]; onClose: () => void }) {
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
    <Modal onClose={onClose} className="card elev-pop max-w-2xl max-h-[80vh] overflow-y-auto nice-scroll">
      <div className="flex items-baseline justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
        <ModalTitle className="text-sm font-semibold">Keyboard shortcuts</ModalTitle>
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
    </Modal>
  );
}
