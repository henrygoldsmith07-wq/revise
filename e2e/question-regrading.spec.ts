import { build } from "esbuild";
import { expect, test } from "@playwright/test";

test("an older grading retry cannot replace the current attempt or consume its update", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const bundle = await build({
    stdin: { contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {useQuestionExecution} from "./src/state/question-execution";
      const question={id:"retry-question",subjectId:"reference",topicIds:[],kind:"mcq",stem:"Which number is two?",options:["2","3"],correctIndex:0,parts:[{id:"part",label:"",prompt:"Choose",marks:1,markScheme:["2"],modelAnswer:"2"}],totalMarks:1,calculatorAllowed:true,difficulty:2,origin:"seed",createdAt:"2026-09-30T00:00:00Z"};
      function App(){
        const execution=useQuestionExecution({question});
        return <div>
          <button onClick={()=>execution.setChoice(0)}>Choose two</button>
          <button onClick={()=>void execution.submit()}>Submit</button>
          <p data-testid="score">{execution.awarded}</p>
          <p data-testid="feedback">{execution.result?.feedback ?? "waiting"}</p>
        </div>;
      }
      createRoot(document.getElementById("root")).render(<App/>);
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    plugins: [{ name: "fixture-store", setup(builder) {
      builder.onResolve({ filter: /^@\/state\/store$/ }, () => ({ path: "store", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        const fixture={userId:"local",attempts:[],questions:[],settings:{},recordFunnel:async()=>{},recordAttempt:async attempt=>{window.savedAttempt=attempt;return [];}};
        export const useStoreFields=()=>fixture;
      ` }));
    } }],
  });
  await page.route("**/retry-harness", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<meta charset="utf-8"><div id="root"></div><script src="/retry-harness.js"></script>' }));
  await page.route("**/retry-harness.js", route => route.fulfill({ contentType: "text/javascript; charset=utf-8", body: bundle.outputFiles[0]!.text }));
  await page.goto("/retry-harness");
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole("button", { name: "Choose two" })).toBeVisible();
  await page.getByRole("button", { name: "Choose two" }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByTestId("score")).toHaveText("1");
  await expect(page.getByTestId("feedback")).toContainText("Correct");
  await page.evaluate(() => {
    const fixture = window as typeof window & { savedAttempt: {id:string;questionId:string;marked:unknown[];feedback:string} };
    const old = { ...fixture.savedAttempt, id: "older-attempt", feedback: "Older answer", awarded: 0,
      marked: [{partId:"part",awarded:0,max:1,creditedPoints:[],missedPoints:["2"],comment:"Review this point"}] };
    window.dispatchEvent(new CustomEvent("revise:ai-dlq-resolved", {detail:{attemptId:old.id,questionId:old.questionId,attempt:old}}));
    window.dispatchEvent(new CustomEvent("revise:ai-dlq-resolved", {detail:{attemptId:fixture.savedAttempt.id,questionId:old.questionId,attempt:old}}));
  });
  await expect(page.getByTestId("score")).toHaveText("1");
  await expect(page.getByTestId("feedback")).toContainText("Correct");
  await page.evaluate(() => {
    const fixture = window as typeof window & { savedAttempt: {id:string;questionId:string} };
    const current = { ...fixture.savedAttempt, feedback: "Current answer regraded", awarded: 0,
      marked: [{partId:"part",awarded:0,max:1,creditedPoints:[],missedPoints:["2"],comment:"Review this point"}], markConfidence: 0.95 };
    window.dispatchEvent(new CustomEvent("revise:ai-dlq-resolved", {detail:{attemptId:current.id,questionId:current.questionId,attempt:current}}));
  });
  await expect(page.getByTestId("feedback")).toHaveText("Current answer regraded");
  await expect(page.getByTestId("score")).toHaveText("0");
  expect(pageErrors).toEqual([]);
});
