"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";
import { cx } from "./ui";

/** The one modal surface. Base UI supplies what the hand-rolled overlays did
 *  not: the page behind is inert and stops scrolling, the popup is portalled
 *  above every stacking context, and focus returns to whatever opened it.
 *  Callers mount it to open it and unmount it to close it. */
export function Modal({
  onClose,
  label,
  align = "center",
  initialFocus,
  className,
  children,
}: {
  onClose: () => void;
  /** Accessible name when the content has no `ModalTitle`. */
  label?: string;
  align?: "center" | "top";
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Viewport
          className={cx(
            "fixed inset-0 z-50 flex justify-center overflow-y-auto p-4",
            align === "top" ? "items-start sm:pt-16" : "items-center",
          )}
        >
          <Dialog.Popup
            aria-label={label}
            initialFocus={initialFocus}
            className={cx("w-full outline-none fade-in", className)}
          >
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalTitle = Dialog.Title;
