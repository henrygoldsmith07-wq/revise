"use client";

import { useMemo } from "react";
import { getTopic } from "@/domain/curriculum";
import { auditRecommendations } from "@/domain/recommendation-audit";
import { useStoreFields } from "@/state/store";
import { Panel, SectionHeading } from "./ui";

/** Plain account of how suggested sessions were used and what the proof ledger shows for those topics. */
export function RecommendationAuditPanel() {
  const store = useStoreFields("funnelEvents", "proofLedger");
  const audit = useMemo(() => auditRecommendations(store.funnelEvents, store.proofLedger), [store.funnelEvents, store.proofLedger]);
  if (!audit.shown) return null;
  return (
    <section aria-labelledby="rec-audit-heading" className="space-y-3">
      <SectionHeading title="Have the suggestions helped?" hint="An audit of your own history, not a test of cause and effect." />
      <h2 id="rec-audit-heading" className="sr-only">Recommendation audit</h2>
      <Panel className="space-y-2">
        <p className="text-sm text-ink">{audit.headline}</p>
        {audit.sufficient ? (
          <ul className="text-xs text-ink2 list-disc pl-4 space-y-0.5">
            <li>{audit.provenMarksAccepted} marks proven on topics you started from a suggestion; {audit.provenMarksOther} on other topics.</li>
            {audit.topics.filter((row) => row.accepted > 0).slice(0, 5).map((row) => (
              <li key={row.topicId}>{getTopic(row.topicId)?.title ?? row.topicId}: {row.verdict.replace(/-/g, " ")}</li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </section>
  );
}
