// A static, zero-JavaScript page.
//
// This is a route handler rather than a page component on purpose: handlers are
// served outside src/app/layout.tsx, so none of the app shell, providers or
// client boundaries apply. It renders for a browser with scripting disabled,
// which is the only situation that reaches it — the app itself links here from
// the <noscript> block in the root layout.
//
// What it may claim is deliberately narrow. The current flagship position is
// that four WJEC A-level subjects are authored to their specification but none
// of their questions have been through human review yet, so the app cannot yet
// prove an improvement. Saying so here is the point of the page.

const SUBJECT = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revise — what it does, and what it cannot yet do</title>
<meta name="description" content="Revise is evidence-based A-level revision. Four WJEC A-level subjects are authored to their specification; no questions have been through human review yet, so Revise cannot yet prove an improvement.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SUBJECT}/welcome">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Revise">
<meta property="og:title" content="Revise — what it does, and what it cannot yet do">
<meta property="og:description" content="Evidence-based A-level revision. Four WJEC A-level subjects are authored to their specification; no questions have been through human review yet.">
<meta property="og:url" content="${SUBJECT}/welcome">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Revise — what it does, and what it cannot yet do">
<meta name="twitter:description" content="Evidence-based A-level revision. Four WJEC A-level subjects are authored to their specification; no questions have been through human review yet.">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f4f4f6; color: #16161a; }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0d; color: #f4f4f6; } }
  main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { font-size: 1.75rem; line-height: 1.25; margin: 0 0 .5rem; }
  h2 { font-size: 1.125rem; margin: 2.25rem 0 .5rem; }
  p, li { margin: .5rem 0; }
  .lead { font-size: 1.0625rem; }
  .honest { border-left: 3px solid currentColor; padding: .25rem 0 .25rem 1rem; margin: 1.5rem 0; }
  ul { padding-left: 1.25rem; }
  a { color: inherit; }
  footer { margin-top: 3rem; font-size: .875rem; opacity: .8; }
  code { font-size: .9em; }
</style>
</head>
<body>
<main>
  <h1>Revise</h1>
  <p class="lead">Exam revision that tells you the one thing to do next, and admits when it cannot prove it.</p>

  <h2>What it does</h2>
  <ul>
    <li>Spaces what you have to remember using FSRS, a scheduler that predicts what you are about to forget.</li>
    <li>Marks answers against a mark scheme written the way an examiner would mark them, and says which scheme point each mark came from.</li>
    <li>Turns lost marks into a named, scheduled repair rather than a list you never return to.</li>
    <li>Keeps your work on your own device. Nothing is sent anywhere unless you switch sync on yourself.</li>
  </ul>

  <h2>What it cannot do yet</h2>
  <div class="honest">
    <p><strong>No question has been through human review yet.</strong></p>
    <p>
      Four WJEC A-level subjects &mdash; Mathematics, Biology, Chemistry and Physics &mdash; have their
      topics and specification statements authored. None of their questions have been signed off by two
      independent human reviewers, and Revise will not count an unreviewed question as evidence.
    </p>
    <p>
      Practising works. Proving that you have improved does not, yet: until questions are reviewed, Revise
      can tell you what you lost marks on but cannot certify the fix. It says so on screen rather than
      showing a confident claim it cannot back.
    </p>
  </div>

  <h2>Why that matters</h2>
  <p>
    A revision app that quietly counts its own questions as trustworthy will tell a student their
    understanding has improved, on the strength of material nobody checked. Most exam-award software has
    that problem. The review gate is the part worth keeping.
  </p>

  <h2>Using it</h2>
  <p>
    The app needs JavaScript, because your revision history lives in your browser's own database and
    nothing is sent to a server to read it back. Turn JavaScript on and open
    <a href="/">the app</a>, or add dates to <code>/settings</code> at any point &mdash; a plan without
    exam dates is still a plan.
  </p>

  <footer>
    Revise &mdash; WJEC A-level revision, currently in build. No accounts are created until you ask for one.
  </footer>
</main>
</body>
</html>`;

export async function GET(): Promise<Response> {
  return new Response(PAGE, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Static prose with nothing per-user in it.
      "cache-control": "public, max-age=3600",
    },
  });
}