"use client";

import { BOOKLET_SOURCE_NOTE, BOOKLET_SOURCE_URL, constantsSheetFor } from "@/content/booklets/constants";
import { RichText } from "./RichText";

// A native disclosure, so it opens with Enter or Space and needs no focus trap.
// The real WJEC paper supplies a data booklet, so it stays available in exam
// conditions: memorising constants the exam gives you earns nothing.
export function ConstantsSheet({ subjectId }: { subjectId: string }) {
  const sheet = constantsSheetFor(subjectId);
  if (!sheet) return null;
  return (
    <details className="card px-3 py-2 text-sm" data-testid="constants-sheet">
      <summary className="cursor-pointer min-h-11 flex items-center font-semibold text-ink">{sheet.title}: reference sheet</summary>
      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {sheet.constants.map((constant) => (
          <div key={constant.id} className="flex flex-wrap justify-between gap-x-2 border-b border-line py-1">
            <dt className="text-ink3">{constant.name} ({constant.symbol.replace("_", "")})</dt>
            <dd className="text-ink"><RichText>{`${constant.value} ${constant.unit}`}</RichText></dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink3">
        {BOOKLET_SOURCE_NOTE}{" "}
        <a className="underline" href={BOOKLET_SOURCE_URL} target="_blank" rel="noreferrer">NIST CODATA</a>
      </p>
    </details>
  );
}
