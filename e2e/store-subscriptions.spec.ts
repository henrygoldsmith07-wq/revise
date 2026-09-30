import { build } from "esbuild";
import { expect, test } from "@playwright/test";

test("committed field subscriptions avoid unrelated React renders", async ({ page }) => {
  const result = await build({
    stdin: { contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { StoreSubscriptionsProvider, useStoreFields } from "./src/state/store-context";
      const counts = { cards: 0, settings: 0, sync: 0 };
      function Cards() { const { cards } = useStoreFields("cards"); counts.cards++; return <p data-testid="cards">{counts.cards}:{cards[0].id}</p>; }
      function Settings() { const { settings } = useStoreFields("settings"); counts.settings++; return <p data-testid="settings">{counts.settings}:{settings.theme}</p>; }
      function Sync() { const { syncStatus } = useStoreFields("syncStatus"); counts.sync++; return <p data-testid="sync">{counts.sync}:{syncStatus.pending}</p>; }
      const views = <><Cards /><Settings /><Sync /></>;
      function App() {
        const [value, setValue] = useState({cards:[{id:"initial"}],settings:{theme:"dark"},syncStatus:{pending:0},interventionOutcomes:[]});
        return <div>
          <button onClick={() => setValue(v => ({...v,syncStatus:{pending:1}}))}>Sync status</button>
          <button onClick={() => setValue(v => ({...v,cards:[{id:"graded"}]}))}>Grade</button>
          <button onClick={() => setValue(v => ({...v,settings:{theme:"light"}}))}>Settings</button>
          <button onClick={() => setValue(v => ({...v,interventionOutcomes:[{id:"outcome"}]}))}>Outcome</button>
          <StoreSubscriptionsProvider value={value}>{views}</StoreSubscriptionsProvider>
        </div>;
      }
      createRoot(document.getElementById("root")).render(<App />);
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.route("**/subscriptions-harness", (route) => route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script src="/subscriptions-harness.js"></script>' }));
  await page.route("**/subscriptions-harness.js", (route) => route.fulfill({ contentType: "text/javascript", body: result.outputFiles[0].text }));
  await page.goto("/subscriptions-harness");
  await expect(page.getByTestId("cards")).toHaveText("1:initial");
  await page.getByRole("button", { name: "Sync status" }).click();
  await expect(page.getByTestId("sync")).toHaveText("2:1");
  await expect(page.getByTestId("cards")).toHaveText("1:initial");
  await expect(page.getByTestId("settings")).toHaveText("1:dark");
  await page.getByRole("button", { name: "Grade", exact: true }).click();
  await expect(page.getByTestId("cards")).toHaveText("2:graded");
  await expect(page.getByTestId("sync")).toHaveText("2:1");
  await expect(page.getByTestId("settings")).toHaveText("1:dark");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("settings")).toHaveText("2:light");
  await page.getByRole("button", { name: "Outcome", exact: true }).click();
  await expect(page.getByTestId("cards")).toHaveText("2:graded");
  await expect(page.getByTestId("sync")).toHaveText("2:1");
  await expect(page.getByTestId("settings")).toHaveText("2:light");
});
