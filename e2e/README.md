# E2E harness

## Offline walk (Playwright)

- `playwright.config.ts` — builds (`next build`) then starts (`next start`) on a fixed port so tests run against the real build artifact. Chromium only locally; set `PLAYWRIGHT_ALL_BROWSERS=1` for Firefox/WebKit.
- `e2e/offline.spec.ts` — onboarding → review → practice → progress → offline banner; skip-link focus; search overlay (button + ⌘K).
- `e2e/visual.spec.ts` — one deterministic Today-shell snapshot (`today-shell.png`) at 2% tolerance. Update with `npx playwright test --update-snapshots` and review the diff in PR.
- Node smoke: `tests/sync.test.ts` mirrors the same walk without a browser so `npm run verify` stays green when Playwright is not installed.

## Running

```bash
npx playwright install --with-deps   # once
npm run test:e2e          # local (Chromium)
PLAYWRIGHT_ALL_BROWSERS=1 npm run test:e2e:ci  # CI matrix
```

## CI vs local

CI runs the Playwright job only when `package.json` has `@playwright/test` installed (see `.github/workflows/revise.yml`); otherwise `npm run test:e2e` is skipped and the node smoke is the gate. Visual snapshots are uploaded as artefacts rather than hard-failing CI — a reviewer confirms intentional visual changes.

## Process contract

Snapshots live at `e2e/__screenshots__/`. Do not hand-edit them. If a snapshot fails, inspect the diff image, decide whether the visual change is intentional, and re-baseline with `--update-snapshots` in the same branch.
