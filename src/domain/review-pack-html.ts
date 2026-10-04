// ---------------------------------------------------------------------------
// Offline reviewer pack.
//
// The review workflow currently requires a terminal: `wjec:review:queue` writes
// markdown + a blank JSON return file, the reviewer edits JSON by hand, and
// `wjec:review:import` validates it. That is fine for this repository and
// hopeless for a working teacher.
//
// This module renders ONE self-contained HTML file that a reviewer can open
// from disk with no terminal, no build step and no network, work through every
// question, and export a return file that `parseReviewReturn` accepts
// unchanged.
//
// Invariants that must not bend:
//   * The page never invents an attestation. Reviewer identity, the review
//     instant and all six checks come from the human; a blank row is omitted
//     and an incomplete row blocks export entirely.
//   * Nothing here approves content. Export produces a *return file*, exactly
//     like the JSON route, and the importer + promotion gates remain the only
//     path to trust.
//   * No I/O, no React, deterministic for a given input (pure domain module).
//
// The client-side rules are shipped as a JavaScript source string so the page
// and the tests execute the same logic; the authoritative contract stays
// `decisionProblems` + `parseReviewReturn` in the review workflow.
// ---------------------------------------------------------------------------

import { REQUIRED_HUMAN_CHECKS } from "./content-trust";

export const REVIEW_PACK_RETURN_BEGIN = "<!--REVISE-REVIEW-RETURN:BEGIN-->";
export const REVIEW_PACK_RETURN_END = "<!--REVISE-REVIEW-RETURN:END-->";

/** Roles the importer accepts, in reviewer-facing wording. */
export const REVIEW_PACK_ROLES = [
  { value: "teacher", label: "Teacher" },
  { value: "examiner", label: "Examiner" },
  { value: "subject-expert", label: "Subject expert" },
] as const;

/** Plain-English labels for the six required checks. */
export const REVIEW_PACK_CHECK_LABELS: Record<(typeof REQUIRED_HUMAN_CHECKS)[number], string> = {
  question: "The question is correct, unambiguous and answerable as written",
  marking: "The mark scheme awards every mark correctly and only once",
  workedSolution: "The worked answer is correct and matches the mark scheme",
  capabilityMapping: "It tests the skill it claims to test",
  specificationMapping: "It is mapped to the right specification statement(s)",
  examRealism: "It reads like a real WJEC paper question at this level",
};

export interface ReviewPackPart {
  label: string;
  prompt: string;
  marks: number;
  markScheme: string[];
  modelAnswer: string;
  specPointRefs: string[];
}

export interface ReviewPackQuestion {
  questionId: string;
  /** Canonical content fingerprint from the current bank; the reviewer must not edit it. */
  fingerprint: string;
  rank: number;
  topicId: string;
  topicTitle: string;
  subjectId: string;
  stem: string;
  totalMarks: number;
  difficulty: number;
  kind: string;
  parts: ReviewPackPart[];
  specPoints: Array<{ ref: string; text: string }>;
  provenance: { source: string; origin: string; specVersion: string | null; lastChecked: string | null };
  unlocks: string[];
  gateWarnings: string[];
  /** Set when near-identical siblings exist: approval never extends to them. */
  reskinWarning: string | null;
  /** Authored classification claims the reviewer may confirm (only when structurally supportable). */
  transferClaimed: boolean;
  dataClaimed: boolean;
  /** Reviewers who already approved this exact content (so reviewer 2 stays independent). */
  alreadyApprovedBy: string[];
}

export interface ReviewPackInput {
  packId: string;
  subjectId: string;
  subjectLabel: string;
  generatedAt: string;
  questions: ReviewPackQuestion[];
}

/** The template data embedded in a fresh pack, before any human fills it in. */
export interface ReviewPackTemplateData {
  formatVersion: 1;
  kind: "template";
  packId: string;
  subjectId: string;
  generatedAt: string;
  questions: Array<{
    questionId: string;
    contentFingerprint: string;
    transferClaimed: boolean;
    dataClaimed: boolean;
    alreadyApprovedBy: string[];
  }>;
}

const CHECK_LIST = REQUIRED_HUMAN_CHECKS.join(",");

export function reviewPackTemplateData(input: ReviewPackInput): ReviewPackTemplateData {
  return {
    formatVersion: 1,
    kind: "template",
    packId: input.packId,
    subjectId: input.subjectId,
    generatedAt: input.generatedAt,
    questions: input.questions.map((question) => ({
      questionId: question.questionId,
      contentFingerprint: question.fingerprint,
      transferClaimed: question.transferClaimed,
      dataClaimed: question.dataClaimed,
      alreadyApprovedBy: question.alreadyApprovedBy,
    })),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON is embedded in a <script> block, so `<` must never appear literally. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, String.raw`\u003c`);
}

// ---------------------------------------------------------------------------
// Client-side rules. Written with String.raw and without backticks so it can be
// embedded in the page verbatim and executed in tests. Mirrors decisionProblems:
// it may be no weaker, and it never fills a field in for the reviewer.
// ---------------------------------------------------------------------------

export const REVIEW_PACK_RULES_JS = String.raw`
var REVIEW_PACK_CHECKS = "${CHECK_LIST}".split(",");
var REVIEW_PACK_ROLES = ["examiner", "teacher", "subject-expert"];
var REVIEW_PACK_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
var REVIEW_PACK_SKEW_MS = 5 * 60 * 1000;

function reviewPackBlank(text) {
  return typeof text !== "string" || text.trim().length === 0;
}

/** The local wall-clock plus the browser's own UTC offset, as a wire instant. */
function reviewPackNowInstant(now, offsetMinutes) {
  var local = new Date(now.getTime() - offsetMinutes * 60000);
  var pad = function (value, width) { return String(value).padStart(width, "0"); };
  var sign = offsetMinutes <= 0 ? "+" : "-";
  var absolute = Math.abs(offsetMinutes);
  return pad(local.getUTCFullYear(), 4) + "-" + pad(local.getUTCMonth() + 1, 2) + "-" + pad(local.getUTCDate(), 2) +
    "T" + pad(local.getUTCHours(), 2) + ":" + pad(local.getUTCMinutes(), 2) + ":" + pad(local.getUTCSeconds(), 2) +
    sign + pad(Math.floor(absolute / 60), 2) + ":" + pad(absolute % 60, 2);
}

/**
 * Errors that must stop an export. The importer re-checks all of this; this is
 * the reviewer-facing gate so a file is never handed over half-complete.
 */
function reviewPackValidate(file, claims, nowMs) {
  var errors = [];
  if (!file || file.formatVersion !== 1) errors.push("The return file must be version 1.");
  var decisions = (file && file.decisions) || [];
  if (!decisions.length) errors.push("Nothing has been reviewed yet: give at least one question a decision.");
  for (var i = 0; i < decisions.length; i++) {
    var row = decisions[i] || {};
    var where = "Question " + (i + 1) + " (" + (row.questionId || "unknown") + ")";
    var claimed = (claims || {})[row.questionId] || {};
    if (reviewPackBlank(row.reviewerId)) errors.push(where + ": a named reviewer is required.");
    if (REVIEW_PACK_ROLES.indexOf(row.reviewerRole) < 0) errors.push(where + ": choose the reviewer role.");
    if (reviewPackBlank(row.reviewerQualification)) errors.push(where + ": the reviewer qualification is required.");
    if (!REVIEW_PACK_INSTANT.test(row.reviewedAt || "")) {
      errors.push(where + ": reviewed at must be a full ISO instant including the timezone, e.g. 2026-10-04T14:05:00+01:00.");
    } else if (Date.parse(row.reviewedAt) > (nowMs || Date.now()) + REVIEW_PACK_SKEW_MS) {
      errors.push(where + ": reviewed at is in the future.");
    }
    if (row.decision === "approve") {
      for (var c = 0; c < REVIEW_PACK_CHECKS.length; c++) {
        if (!row.checks || row.checks[REVIEW_PACK_CHECKS[c]] !== true) {
          errors.push(where + ": every one of the six checks must be ticked before approving.");
          break;
        }
      }
      if (row.classification && row.classification.transferConfirmed === true && claimed.transferClaimed !== true) {
        errors.push(where + ": transfer was confirmed, but this question has no structural transfer link.");
      }
      if (row.classification && row.classification.dataAnalysisConfirmed === true && claimed.dataClaimed !== true) {
        errors.push(where + ": data analysis was confirmed, but this question has no authored data.");
      }
    } else if (row.decision !== "reject" && row.decision !== "revise") {
      errors.push(where + ": choose approve, needs changes or reject.");
    } else if (reviewPackBlank(row.comments)) {
      errors.push(where + ": a comment is required when rejecting or requesting changes.");
    }
    if (claimed.alreadyApprovedBy && claimed.alreadyApprovedBy.indexOf(row.reviewerId) >= 0 && row.decision === "approve") {
      errors.push(where + ": " + row.reviewerId + " already approved this exact content; a different reviewer must confirm it.");
    }
  }
  return errors;
}
`;

// ---------------------------------------------------------------------------
// DOM wiring. Kept separate from the rules above so both can be embedded and
// the rules can be executed in tests without a document.
// ---------------------------------------------------------------------------

export const REVIEW_PACK_WIRING_JS = String.raw`
(function () {
  var marker = document.getElementById("review-pack-data");
  var statusBox = document.getElementById("review-pack-status");
  var output = document.getElementById("review-pack-output");
  var download = document.getElementById("review-pack-download");
  var template = JSON.parse(marker.textContent);

  var claims = {};
  var order = [];
  for (var i = 0; i < template.questions.length; i++) {
    var row = template.questions[i];
    order.push(row.questionId);
    claims[row.questionId] = row;
  }

  function field(id) { var node = document.getElementById(id); return node ? node.value : ""; }
  function radioValue(name) {
    var nodes = document.querySelectorAll('input[name="' + name + '"]');
    for (var i = 0; i < nodes.length; i++) if (nodes[i].checked) return nodes[i].value;
    return "";
  }

  function collectDecision(row, index) {
    var key = String(index);
    var checks = {};
    var touched = false;
    for (var i = 0; i < REVIEW_PACK_CHECKS.length; i++) {
      var box = document.getElementById("check-" + key + "-" + REVIEW_PACK_CHECKS[i]);
      var on = Boolean(box && box.checked);
      checks[REVIEW_PACK_CHECKS[i]] = on;
      if (on) touched = true;
    }
    var decision = radioValue("decision-" + key);
    var comment = field("comment-" + key);
    var transfer = document.getElementById("transfer-" + key);
    var data = document.getElementById("data-" + key);
    var classification = {};
    if (transfer && transfer.checked) { classification.transferConfirmed = true; touched = true; }
    if (data && data.checked) { classification.dataAnalysisConfirmed = true; touched = true; }
    if (comment.trim()) touched = true;
    if (decision) touched = true;
    if (!touched) return null;
    return {
      questionId: row.questionId,
      contentFingerprint: row.contentFingerprint,
      decision: decision || "",
      reviewerId: field("reviewer-id"),
      reviewerRole: field("reviewer-role"),
      reviewerQualification: field("reviewer-qualification"),
      reviewedAt: field("reviewed-at"),
      checks: checks,
      comments: comment,
      classification: classification
    };
  }

  function buildReturnFile() {
    var decisions = [];
    for (var i = 0; i < template.questions.length; i++) {
      var decision = collectDecision(template.questions[i], i);
      if (decision) decisions.push(decision);
    }
    return { formatVersion: 1, packId: template.packId, decisions: decisions };
  }

  function show(messages, kind) {
    statusBox.className = kind || "";
    if (!messages.length) { statusBox.textContent = "Ready to export."; return; }
    var list = document.createElement("ul");
    for (var i = 0; i < messages.length; i++) {
      var item = document.createElement("li");
      item.textContent = messages[i];
      list.appendChild(item);
    }
    statusBox.textContent = "";
    statusBox.appendChild(list);
  }

  var nowButton = document.getElementById("review-pack-now");
  if (nowButton) nowButton.addEventListener("click", function () {
    var input = document.getElementById("reviewed-at");
    input.value = reviewPackNowInstant(new Date(), new Date().getTimezoneOffset());
  });

  document.getElementById("review-pack-export").addEventListener("click", function () {
    var file = buildReturnFile();
    var errors = reviewPackValidate(file, claims, Date.now());
    if (errors.length) {
      show(errors, "bad");
      output.value = "";
      download.hidden = true;
      return;
    }
    var text = JSON.stringify(file, null, 2).replace(/</g, "\\u003c");
    marker.textContent = text;
    output.value = text;
    var blob = new Blob([text], { type: "application/json" });
    download.href = URL.createObjectURL(blob);
    download.download = "review-return.json";
    download.hidden = false;
    show(["Exported " + file.decisions.length + " decision(s). Save the file as review-return.json."], "good");
  });

  document.getElementById("review-pack-check").addEventListener("click", function () {
    var errors = reviewPackValidate(buildReturnFile(), claims, Date.now());
    show(errors, errors.length ? "bad" : "good");
  });
})();
`;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function renderPart(questionId: string, part: ReviewPackPart): string {
  const scheme = part.markScheme.length
    ? `<ol class="scheme">${part.markScheme.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ol>`
    : `<p class="warn">No mark scheme point is recorded for this part.</p>`;
  const refs = part.specPointRefs.length
    ? `<p class="meta">Specification: ${part.specPointRefs.map((ref) => `<span class="chip">${escapeHtml(ref)}</span>`).join(" ")}</p>`
    : "";
  return `<section class="part">
  <header><span class="chip strong">${escapeHtml(part.label || "Part")}</span> <span class="chip">${part.marks} mark${part.marks === 1 ? "" : "s"}</span></header>
  <p class="prompt">${escapeHtml(part.prompt)}</p>
  ${refs}
  <div class="grid2">
    <div><h4>Mark scheme</h4>${scheme}</div>
    <div><h4>Worked answer</h4><p class="answer">${escapeHtml(part.modelAnswer)}</p></div>
  </div>
</section>`;
}

function renderChecks(index: number): string {
  return REQUIRED_HUMAN_CHECKS.map((check) => `<label class="check">
      <input type="checkbox" id="check-${index}-${check}">
      <span>${escapeHtml(REVIEW_PACK_CHECK_LABELS[check])}</span>
    </label>`).join("");
}

/** DOM tokens are the row index, never the question id: ids may need escaping. */
function renderQuestion(question: ReviewPackQuestion, index: number): string {
  const id = String(index);
  const specs = question.specPoints.length
    ? `<ul class="specs">${question.specPoints.map((spec) => `<li><span class="chip">${escapeHtml(spec.ref)}</span> ${escapeHtml(spec.text)}</li>`).join("")}</ul>`
    : `<p class="warn">No specification statement is linked. The importer will reject an approval.</p>`;
  const provenance = `source <strong>${escapeHtml(question.provenance.source)}</strong> · origin <strong>${escapeHtml(question.provenance.origin)}</strong> · spec version <strong>${escapeHtml(question.provenance.specVersion ?? "none")}</strong> · last checked <strong>${escapeHtml(question.provenance.lastChecked ?? "never")}</strong>`;
  const unlocks = question.unlocks.length
    ? `<p class="meta">Why this one: ${question.unlocks.map((unlock) => escapeHtml(unlock)).join("; ")}</p>`
    : "";
  const reskin = question.reskinWarning
    ? `<p class="flag">Reskin warning: ${escapeHtml(question.reskinWarning)}</p>`
    : "";
  const warnings = question.gateWarnings.length
    ? `<div class="flag"><strong>Gate warnings</strong><ul>${question.gateWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>`
    : "";
  const prior = question.alreadyApprovedBy.length
    ? `<p class="flag">Already approved by ${question.alreadyApprovedBy.map((who) => escapeHtml(who)).join(", ")}. A second, different reviewer must confirm the same content.</p>`
    : "";
  const classification = question.transferClaimed || question.dataClaimed
    ? `<div class="classify"><strong>Confirm the authored classification (optional, only if true)</strong>
      ${question.transferClaimed ? `<label class="check"><input type="checkbox" id="transfer-${id}"><span>This genuinely tests transfer to an unfamiliar setup</span></label>` : ""}
      ${question.dataClaimed ? `<label class="check"><input type="checkbox" id="data-${id}"><span>This genuinely requires reading data, a graph or practical results</span></label>` : ""}
    </div>`
    : "";

  return `<article class="question" id="q-${id}">
  <header class="qhead">
    <h2>${question.rank}. ${escapeHtml(question.questionId)}</h2>
    <p class="meta">${escapeHtml(question.topicTitle)} · ${question.totalMarks} marks · difficulty ${question.difficulty} · ${escapeHtml(question.kind)}</p>
    <p class="fp">Fingerprint <code>${escapeHtml(question.fingerprint)}</code></p>
    ${unlocks}
  </header>
  <p class="stem">${escapeHtml(question.stem)}</p>
  <div class="panel"><h3>Specification statement(s)</h3>${specs}</div>
  <div class="panel"><h3>Provenance</h3><p class="meta">${provenance}</p></div>
  ${reskin}
  ${warnings}
  ${prior}
  ${question.parts.map((part) => renderPart(question.questionId, part)).join("")}
  <div class="panel decision">
    <h3>Your decision on this exact content</h3>
    <div class="choices">
      <label class="choice"><input type="radio" name="decision-${id}" value="approve"><span><strong>Approve</strong> — all six checks pass</span></label>
      <label class="choice"><input type="radio" name="decision-${id}" value="revise"><span><strong>Needs changes</strong> — explain what must change</span></label>
      <label class="choice"><input type="radio" name="decision-${id}" value="reject"><span><strong>Reject</strong> — explain why</span></label>
    </div>
    <fieldset class="checks"><legend>The six checks (all required to approve)</legend>${renderChecks(index)}</fieldset>
    ${classification}
    <label class="wide">Comment (required for needs changes or reject)
      <textarea id="comment-${id}" rows="3" placeholder="What is wrong, or what must change?"></textarea>
    </label>
  </div>
</article>`;
}

const STYLE = `
:root { --bg:#f6f6f8; --surface:#fff; --line:#d9d9e0; --ink:#16161a; --ink2:#4c4c55; --ink3:#6d6d78; --warn:#8a4b00; --warnbg:#fff6e5; --flag:#8a1f1f; --flagbg:#fff0f0; --good:#155724; --goodbg:#e8f6ec; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e0e11; --surface:#17171b; --line:#33333b; --ink:#f2f2f4; --ink2:#b6b6bf; --ink3:#8d8d97; --warnbg:#2a2010; --flagbg:#2a1414; --goodbg:#12261a; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
.wrap { max-width:960px; margin:0 auto; padding:0 18px 64px; }
header.top { padding:28px 0 12px; border-bottom:1px solid var(--line); }
h1 { font-size:26px; margin:0 0 6px; letter-spacing:-.02em; }
h2 { font-size:18px; margin:0; }
h3 { font-size:14px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink3); margin:0 0 8px; }
h4 { font-size:13px; margin:0 0 6px; color:var(--ink2); }
.meta { color:var(--ink2); font-size:13px; margin:4px 0; }
.fp { font-size:12px; color:var(--ink3); word-break:break-all; }
code { font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
.chip { display:inline-block; background:var(--bg); border:1px solid var(--line); border-radius:999px; padding:2px 10px; font-size:12px; margin-right:4px; }
.chip.strong { font-weight:700; }
.panel, .question { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:18px; margin:16px 0; }
.question { padding:22px; }
.qhead { border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:12px; }
.stem { font-size:16px; white-space:pre-wrap; }
.part { border-top:1px solid var(--line); padding:14px 0; }
.part header { margin-bottom:6px; }
.prompt { margin:6px 0; white-space:pre-wrap; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:10px; }
@media (max-width:720px) { .grid2 { grid-template-columns:1fr; } }
.scheme { margin:0; padding-left:20px; font-size:14px; }
.answer { font-size:14px; white-space:pre-wrap; margin:0; }
.specs { margin:0; padding-left:18px; font-size:14px; }
.flag { background:var(--flagbg); color:var(--flag); border-radius:10px; padding:10px 14px; font-size:13px; margin:10px 0; }
.flag ul { margin:6px 0 0; padding-left:18px; }
.warn { background:var(--warnbg); color:var(--warn); border-radius:10px; padding:8px 12px; font-size:13px; }
.decision { border-color:var(--ink3); }
.choices, .checks { display:grid; gap:8px; margin:8px 0 12px; }
.choice, .check { display:flex; gap:10px; align-items:flex-start; font-size:14px; }
fieldset { border:1px solid var(--line); border-radius:12px; padding:12px; margin:12px 0; }
legend { font-size:13px; color:var(--ink3); padding:0 6px; }
textarea { width:100%; font:14px/1.5 inherit; padding:8px 10px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); }
input[type=text], input[type=datetime-local], select { font:14px inherit; padding:8px 10px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); width:100%; }
.wide { display:block; margin-top:10px; font-size:14px; }
.identity { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; }
.identity label { font-size:13px; color:var(--ink2); display:block; }
button { font:600 14px inherit; padding:10px 18px; border-radius:12px; border:1px solid var(--ink); background:var(--ink); color:var(--bg); cursor:pointer; }
button.secondary { background:transparent; color:var(--ink); border-color:var(--line); }
.actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:12px; }
#review-pack-status { font-size:14px; margin:12px 0; }
#review-pack-status.bad { background:var(--flagbg); color:var(--flag); border-radius:10px; padding:12px 14px; }
#review-pack-status.good { background:var(--goodbg); color:var(--good); border-radius:10px; padding:12px 14px; }
#review-pack-output { margin-top:10px; min-height:120px; font:12px/1.5 ui-monospace,Menlo,monospace; }
@media print { button, #review-pack-output, .actions { display:none; } body { background:#fff; } .question { break-inside:avoid; } }
`;

export function buildReviewPackHtml(input: ReviewPackInput): string {
  const template = reviewPackTemplateData(input);
  const total = input.questions.length;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'">
<title>Review pack ${escapeHtml(input.packId)} — ${escapeHtml(input.subjectLabel)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <h1>${escapeHtml(input.subjectLabel)} — review pack ${escapeHtml(input.packId)}</h1>
  <p class="meta">${total} question${total === 1 ? "" : "s"} · generated ${escapeHtml(input.generatedAt)}</p>
  <p class="meta">This file works offline. It never sends anything anywhere and it cannot approve content by itself: exporting produces a return file that a maintainer still has to import.</p>
</header>

<div class="panel">
  <h3>1. Who is reviewing</h3>
  <p class="meta">Sign in once; your identity is applied to every question you decide. Leaving a question untouched omits it from the return file.</p>
  <div class="identity">
    <label>Your name or pseudonymous reviewer ID
      <input type="text" id="reviewer-id" autocomplete="off" placeholder="e.g. j-patel-physics">
    </label>
    <label>Your role
      <select id="reviewer-role">
        <option value="">Choose…</option>
        ${REVIEW_PACK_ROLES.map((role) => `<option value="${role.value}">${escapeHtml(role.label)}</option>`).join("")}
      </select>
    </label>
    <label>Your qualification (how you are qualified to judge this)
      <input type="text" id="reviewer-qualification" autocomplete="off" placeholder="e.g. PGCE physics, 12 years teaching A-level">
    </label>
    <label>When you reviewed (full ISO instant, including timezone)
      <input type="text" id="reviewed-at" autocomplete="off" placeholder="2026-10-04T14:05:00+01:00">
      <span class="actions"><button type="button" class="secondary" id="review-pack-now">Insert my current time</button></span>
    </label>
  </div>
</div>

<div class="panel">
  <h3>2. How to review</h3>
  <p class="meta">Solve each question yourself before reading the mark scheme. Then tick a check only if you have verified it. Approving needs all six checks; needs changes and reject need a comment. Nothing here is a mark or an approval until a second, different reviewer approves the same fingerprint.</p>
</div>

${input.questions.map((question, index) => renderQuestion(question, index)).join("\n")}

<div class="panel">
  <h3>3. Export</h3>
  <div class="actions">
    <button type="button" id="review-pack-check">Check my answers</button>
    <button type="button" id="review-pack-export">Export review-return.json</button>
    <a id="review-pack-download" hidden download="review-return.json">Download the file</a>
  </div>
  <div id="review-pack-status">Nothing reviewed yet.</div>
  <textarea id="review-pack-output" readonly placeholder="The return file appears here once every decided question is complete."></textarea>
  <p class="meta">Save or copy the JSON as <code>review-return.json</code>, then a maintainer runs <code>npm run wjec:review:import -- review-return.json</code>.</p>
</div>
</div>
${REVIEW_PACK_RETURN_BEGIN}
<script type="application/json" id="review-pack-data">${embedJson(template)}</script>
${REVIEW_PACK_RETURN_END}
<script>${REVIEW_PACK_RULES_JS}</script>
<script>${REVIEW_PACK_WIRING_JS}</script>
</body>
</html>
`;
}

/** Pull the return-file JSON out of an exported pack. Pure. */
export function extractReviewPackReturn(html: string): { json: string | null; errors: string[] } {
  const start = html.indexOf(REVIEW_PACK_RETURN_BEGIN);
  const end = html.indexOf(REVIEW_PACK_RETURN_END);
  if (start < 0 || end < 0 || end < start) {
    return { json: null, errors: ["this file is not a Revise review pack (the return marker is missing)"] };
  }
  const block = html.slice(start + REVIEW_PACK_RETURN_BEGIN.length, end);
  const match = /<script[^>]*id="review-pack-data"[^>]*>([\s\S]*?)<\/script>/.exec(block);
  if (!match) return { json: null, errors: ["the review pack has no return data block"] };
  const json = match[1]!.trim();
  if (!json) return { json: null, errors: ["the return data block is empty"] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { json: null, errors: ["the return data block is not valid JSON; export again from the pack"] };
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { decisions?: unknown }).decisions)) {
    return { json: null, errors: ["this pack has not been filled in yet: no decisions were exported"] };
  }
  return { json, errors: [] };
}