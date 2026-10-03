"use client";

// The six learner words as a chip. The reason is on the chip's tooltip and in screen-reader
// text, so the list stays quiet and the "why does Revise think this?" answer is one tap away.

import { LEARNER_STATE_LABEL, LEARNER_STATE_TONE, type LearnerStateView } from "@/domain/learner-state";
import { Pill } from "./ui";

export function LearnerStateTag({ view }: { view: LearnerStateView }) {
  return (
    <Pill tone={LEARNER_STATE_TONE[view.state]} title={view.detail}>
      {LEARNER_STATE_LABEL[view.state]}
      <span className="sr-only">. {view.detail}</span>
    </Pill>
  );
}
