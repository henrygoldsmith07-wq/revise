import { build } from "esbuild";
import { expect, test } from "@playwright/test";

test("derived models recompute only for their evidence fields", async ({ page }) => {
  const bundle = await build({stdin:{contents:`
    import React,{useState} from "react";
    import {createRoot} from "react-dom/client";
    import {useLearnerMastery} from "./src/state/learner-mastery";
    import {useAssessmentModels} from "./src/state/assessment-models";
    const topics=[]; const subjectIds=[];
    const counts={recall:0,application:0,predictions:0,calibration:0}; const previous={};
    function App(){
      const [snapshot,setSnapshot]=useState({cards:[],reviewLogs:[],attempts:[],mistakes:[],questions:[],papers:[],examDates:[],plannedSessions:[],settings:{theme:"dark"}});
      const mastery=useLearnerMastery(snapshot,topics);
      const assessment=useAssessmentModels(snapshot,mastery.mastery,subjectIds);
      const values={recall:mastery.recallMastery,application:mastery.applicationMastery,predictions:assessment.predictions,calibration:assessment.responseTimeCalibration};
      for(const [key,value] of Object.entries(values)){if(previous[key]!==value){counts[key]++;previous[key]=value;}}
      return <div><p data-testid="counts">{JSON.stringify(counts)}</p>
        <button onClick={()=>setSnapshot(s=>({...s,settings:{theme:"light"}}))}>Theme</button>
        <button onClick={()=>setSnapshot(s=>({...s,plannedSessions:[]}))}>Plan</button>
        <button onClick={()=>setSnapshot(s=>({...s,attempts:[]}))}>Answer</button>
        <button onClick={()=>setSnapshot(s=>({...s,cards:[],reviewLogs:[]}))}>Recall</button>
      </div>;
    }
    createRoot(document.getElementById("root")).render(<App/>);
  `,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
  await page.route("**/derived-harness",route=>route.fulfill({contentType:"text/html",body:'<div id="root"></div><script src="/derived-harness.js"></script>'}));
  await page.route("**/derived-harness.js",route=>route.fulfill({contentType:"text/javascript",body:bundle.outputFiles[0]!.text}));
  await page.goto("/derived-harness");
  const counts=page.getByTestId("counts");
  await expect(counts).toHaveText('{"recall":1,"application":1,"predictions":1,"calibration":1}');
  await page.getByRole("button",{name:"Theme"}).click();
  await page.getByRole("button",{name:"Plan"}).click();
  await expect(counts).toHaveText('{"recall":1,"application":1,"predictions":1,"calibration":1}');
  await page.getByRole("button",{name:"Answer"}).click();
  await expect(counts).toHaveText('{"recall":1,"application":2,"predictions":2,"calibration":2}');
  await page.getByRole("button",{name:"Recall",exact:true}).click();
  await expect(counts).toHaveText('{"recall":2,"application":2,"predictions":3,"calibration":2}');
});
