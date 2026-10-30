// The words on /welcome, as data, so the static HTML page (src/app/welcome/route.ts)
// and its markdown twin (/welcome.md) say exactly the same thing.
//
// What it may claim is deliberately narrow. The current flagship position is
// that four WJEC A-level subjects are authored to their specification but none
// of their questions have been through human review yet, so the app cannot yet
// prove an improvement. Saying so here is the point of the page.
//
// Inline markup is a tiny subset understood by both renderers: **bold**,
// `code` and [text](/path).

export interface WelcomeSection {
  heading: string;
  /** Rendered as a bulleted list. */
  items?: string[];
  paragraphs?: string[];
  /** Set off as the page's honest statement. */
  honest?: boolean;
}

export const WELCOME = {
  title: "Revise — what it does, and what it cannot yet do",
  description:
    "Revise is evidence-based WJEC A-level revision, Physics first. Four WJEC A-level subjects are authored to their specification; no questions have been through human review yet, so Revise cannot yet prove an improvement.",
  socialDescription:
    "Evidence-based WJEC A-level revision, Physics first. Four subjects authored to specification; no questions human-reviewed yet.",
  lead: "WJEC A-level revision, Physics first: the one thing to do next, and honesty about what cannot be proven yet.",
  sections: [
    {
      heading: "What it does",
      items: [
        "Spaces what you have to remember using FSRS, a scheduler that predicts what you are about to forget.",
        "Marks answers against a mark scheme written the way an examiner would mark them, and says which scheme point each mark came from.",
        "Turns lost marks into a named, scheduled repair rather than a list you never return to.",
        "Keeps your work on your own device. Nothing is sent anywhere unless you switch sync on yourself.",
      ],
    },
    {
      heading: "What it cannot do yet",
      honest: true,
      paragraphs: [
        "**No question has been through human review yet.**",
        "Four WJEC A-level subjects — Mathematics, Biology, Chemistry and Physics — have their topics and specification statements authored. None of their questions have been signed off by two independent human reviewers, and Revise will not count an unreviewed question as evidence.",
        "Practising works. Proving that you have improved does not, yet: until questions are reviewed, Revise can tell you what you lost marks on but cannot certify the fix. It says so on screen rather than showing a confident claim it cannot back.",
      ],
    },
    {
      heading: "Why that matters",
      paragraphs: [
        "A revision app that quietly counts its own questions as trustworthy will tell a student their understanding has improved, on the strength of material nobody checked. Most exam-award software has that problem. The review gate is the part worth keeping.",
      ],
    },
    {
      heading: "Free WJEC A-level Physics guides",
      items: [
        "[Every topic, by how often it is examined](/wjec-a-level-physics)",
        "[Past paper questions by topic](/wjec-a-level-physics/past-papers)",
        "[The definitions you must learn](/wjec-a-level-physics/definitions)",
        "[Data booklet constants and key equations](/wjec-a-level-physics/data-booklet)",
      ],
    },
    {
      heading: "Using it",
      paragraphs: [
        "The app needs JavaScript, because your revision history lives in your browser's own database and nothing is sent to a server to read it back. Turn JavaScript on and open [the app](/), or add dates to `/settings` at any point — a plan without exam dates is still a plan.",
      ],
    },
  ] satisfies WelcomeSection[],
  footer:
    "Revise — WJEC A-level revision, Physics first, currently in build. No accounts are created until you ask for one.",
} as const;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline markup to HTML. Input is escaped first, so the only tags are the ones added here. */
export function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Inline markup to markdown: only relative links change, to absolute ones. */
export function inlineMarkdown(text: string, absolute: (path: string) => string): string {
  return text.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_, label: string, path: string) => `[${label}](${absolute(path)})`);
}
