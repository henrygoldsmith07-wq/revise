"use client";

import type { TopicStatus } from "@/domain/topic-status";
import { Pill } from "./ui";

/**
 * Plain-language topic status chip. The word itself carries the meaning
 * (never colour alone); the icon repeats it for low-vision users and the
 * tooltip holds the one-sentence "what to do" explanation.
 */
export function TopicStatusTag({ status, explanation }: { status: TopicStatus; explanation: string }) {
  const tone = status === "covered" ? "success" : status === "shaky" ? "review" : "neutral";
  return (
    <Pill tone={tone} title={explanation} className="capitalize">
      {status === "covered" ? (
        <svg viewBox="0 0 12 12" aria-hidden="true" className="w-3 h-3 mr-1 align-[-1px] inline-block" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="4.8" />
          <path d="M4 6.2l1.4 1.4 2.6-3" />
        </svg>
      ) : status === "shaky" ? (
        <svg viewBox="0 0 12 12" aria-hidden="true" className="w-3 h-3 mr-1 align-[-1px] inline-block" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1.5 7.5c1.5-2.2 3-2.2 4.5 0s3 2.2 4.5 0" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" aria-hidden="true" className="w-3 h-3 mr-1 align-[-1px] inline-block" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 2.5v4" />
          <path d="M6 9.2v.3" />
        </svg>
      )}
      {status}
    </Pill>
  );
}
