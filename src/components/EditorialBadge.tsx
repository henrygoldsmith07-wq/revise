import { Pill } from "./ui";
import { provenanceLabel } from "@/domain/trust-label";
import type { Question } from "@/domain/types";

// Visible trust badges. The whole point: a student (or teacher) can tell at a
// glance whether content was examiner-verified or generated and unreviewed.
// Generated content never silently becomes trusted: AI origin always shows,
// and proof-capable questions are the only ones that can carry proof.

export function EditorialBadge({
  source,
  verification,
  origin,
  reviewer,
  contentTier,
  question,
}: {
  source?: string | null;
  verification?: string | null;
  origin?: string | null;
  reviewer?: string | null;
  contentTier?: string | null;
  question?: Question | null;
}) {
  if (question) {
    const label = provenanceLabel(question);
    if (label.includes("Proof-capable")) return <Pill tone="success">{label}</Pill>;
    if (label.includes("Trusted")) return <Pill tone="success">{label}</Pill>;
    if (label.includes("Independently")) return <Pill tone="success">{label}</Pill>;
    if (label.includes("Reviewed")) return <Pill>{label}</Pill>;
    if (label.includes("Reference")) return <Pill tone="review">{label}</Pill>;
    return <Pill tone={question.origin === "ai" ? "danger" : "review"}>{label}</Pill>;
  }
  if (contentTier === "reference") {
    return <Pill tone="review">Reference · not spec-checked</Pill>;
  }
  if (verification === "verified") {
    return (
      <Pill tone="success">
        Verified{reviewer ? ` · ${reviewer}` : ""}
      </Pill>
    );
  }
  if (origin === "ai") {
    return (
      <Pill tone={verification === "checked" ? "speak" : "danger"}>
        {verification === "checked" ? "AI generated · checked" : "AI generated · unreviewed"}
      </Pill>
    );
  }
  if (source === "past-paper") {
    return <Pill tone="review">Past paper</Pill>;
  }
  if (verification === "checked") {
    return <Pill>Checked</Pill>;
  }
  if (source && source !== "authored") {
    return <Pill tone="review">{`${source} · unreviewed`}</Pill>;
  }
  return null;
}
