"use client";

// ---------------------------------------------------------------------------
// Honest pace forecast line.
//
// One passive status strip — no call to action, no percentage, no colour-only
// meaning: the sentence itself carries the message. Shown on Today beneath
// the session so the student knows what the pace actually implies, without
// competing with the single CTA.
// ---------------------------------------------------------------------------

import type { PaceForecast } from "@/domain/pace-forecast";

export function PaceForecastLine({ forecast }: { forecast: PaceForecast }) {
  return (
    <p className="text-xs text-ink3 mt-3 border-t border-line pt-3" role="status" aria-live="polite">
      {forecast.sentence}
    </p>
  );
}