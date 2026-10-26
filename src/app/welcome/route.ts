// A static, zero-JavaScript page.
//
// This is a route handler rather than a page component on purpose: handlers are
// served outside src/app/layout.tsx, so none of the app shell, providers or
// client boundaries apply. It renders for a browser with scripting disabled,
// which is the only situation that reaches it — the app itself links here from
// the <noscript> block in the root layout.
//
// The words live in src/lib/welcome.ts so this page and /welcome.md say the
// same thing; the claims they may make are explained there.

import { absoluteUrl, SITE } from "@/lib/site";
import { inlineHtml, WELCOME, type WelcomeSection } from "@/lib/welcome";

const CANONICAL = absoluteUrl("/welcome");

function section(block: WelcomeSection): string {
  const items = block.items ? `\n  <ul>\n${block.items.map((item) => `    <li>${inlineHtml(item)}</li>`).join("\n")}\n  </ul>` : "";
  const paragraphs = (block.paragraphs ?? []).map((text) => `<p>${inlineHtml(text)}</p>`).join("\n    ");
  const body = paragraphs ? (block.honest ? `\n  <div class="honest">\n    ${paragraphs}\n  </div>` : `\n  ${paragraphs}`) : "";
  return `  <h2>${inlineHtml(block.heading)}</h2>${items}${body}`;
}

const PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${WELCOME.title}</title>
<meta name="description" content="${WELCOME.description}">
<meta name="ai-summary" content="${SITE.aiSummary}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${CANONICAL}">
<link rel="alternate" type="text/markdown" href="${absoluteUrl("/welcome.md")}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${WELCOME.title}">
<meta property="og:description" content="${WELCOME.socialDescription}">
<meta property="og:url" content="${CANONICAL}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${WELCOME.title}">
<meta name="twitter:description" content="${WELCOME.socialDescription}">
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
  <h1>${SITE.name}</h1>
  <p class="lead">${inlineHtml(WELCOME.lead)}</p>

${WELCOME.sections.map(section).join("\n\n")}

  <footer>
    ${inlineHtml(WELCOME.footer)}
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
