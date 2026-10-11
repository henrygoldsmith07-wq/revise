import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seedQuestionsForSubject } from "@/content";
import { diagnosticFinished, diagnosticReport, diagnosticStartBlocker, nextProbe, type ProbeRecord } from "@/domain/adaptive-diagnostic";
import { diagnosticItems } from "@/domain/diagnostic-items";
import { trustViaWorkflow } from "../e2e/review-fixture";

// Regression for a real dead end: with the e2e fixture's two (fixture-only)
// teacher approvals on the first eight prioritised WJEC Maths topics, 24
// questions are trusted and none is recall-level. The full diagnostic used to
// finish immediately with "No diagnostic answers yet". Nothing here is written
// to the repository's review ledger or audit log.

const SUBJECT = "wjec-alevel-maths";
const bank = seedQuestionsForSubject(SUBJECT);
const trusted = trustViaWorkflow(SUBJECT, bank, 8);
const merged = bank.map((q) => trusted.find((t) => t.id === q.id) ?? q);
const items = diagnosticItems(SUBJECT, merged);
const topicIds = [...new Set(items.map((i) => i.topicId))];

describe("full diagnostic on the 24-trusted WJEC Maths fixture", () => {
  it("is the no-recall case this fix is for", () => {
    expect(trusted).toHaveLength(24);
    expect(items).toHaveLength(24);
    expect(items.some((i) => i.depth === "recall")).toBe(false);
  });

  it("uses only trusted questions, and asks a first question", () => {
    const ids = new Set(trusted.map((q) => q.id));
    expect(items.every((i) => ids.has(i.id))).toBe(true);
    const first = nextProbe({ topicIds, items, records: [] });
    expect(first).not.toBeNull();
    expect(first!.item.depth).toBe("application");
    expect(diagnosticStartBlocker({ topicIds, items, records: [] })).toBeNull();
  });

  it("runs a real session that reaches several topics and ends with a report", () => {
    let records: ProbeRecord[] = [];
    for (let i = 0; i < 40 && !diagnosticFinished({ topicIds, items, records }); i++) {
      const probe = nextProbe({ topicIds, items, records })!;
      records = [...records, { itemId: probe.item.id, topicId: probe.item.topicId, depth: probe.item.depth, correct: i % 3 !== 0, confident: i % 2 === 0, seconds: probe.item.expectedSeconds }];
    }
    expect(records.length).toBeGreaterThanOrEqual(5);
    expect(new Set(records.map((r) => r.topicId)).size).toBeGreaterThanOrEqual(5);
    const report = diagnosticReport(records, topicIds, items);
    expect(report.established.join(" ")).not.toContain("No diagnostic answers yet");
  });

  it("explains, rather than reporting nothing, when every trusted question was answered before", () => {
    expect(diagnosticStartBlocker({ topicIds, items, records: [], seenItemIds: new Set(items.map((i) => i.id)) })).toBe("all-seen");
    const page = readFileSync(join(process.cwd(), "src/app/diagnostic/page.tsx"), "utf8");
    expect(page).toContain("const blocker = finished && !records.length ? diagnosticStartBlocker(input) : null;");
    expect(page).toContain("Nothing new for the full diagnostic to ask");
    expect(page).toContain('<ButtonLink href="/" variant="primary">See your next step on Today</ButtonLink>');
  });
});
