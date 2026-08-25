import { Pill } from "./ui";

// Visible trust badges. The whole point: a student (or teacher) can tell at a
// glance whether content was examiner-verified or generated and unreviewed.

export function EditorialBadge({
  source,
  verification,
  origin,
  reviewer,
}: {
  source?: string | null;
  verification?: string | null;
  origin?: string | null;
  reviewer?: string | null;
}) {
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
