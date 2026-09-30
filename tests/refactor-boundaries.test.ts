import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("domain module dependency graph",()=>{
  it("has no runtime cycles through the extracted domain responsibilities",async()=>{
    const result=await build({entryPoints:["src/domain/adaptive-session.ts","src/domain/subject-correctness.ts","src/domain/subject-assessment-semantic.ts","src/domain/marking.ts","src/domain/recommender.ts"],bundle:true,platform:"node",format:"esm",write:false,metafile:true,outdir:"/tmp/revise-boundary-check"});
    const inputs=result.metafile!.inputs;
    const visiting=new Set<string>(); const done=new Set<string>();
    function visit(file:string,path:string[]){
      if(done.has(file))return;
      if(visiting.has(file))throw new Error(`Runtime cycle: ${[...path,file].join(" → ")}`);
      visiting.add(file);
      for(const edge of inputs[file]?.imports??[])if(!edge.external&&inputs[edge.path])visit(edge.path,[...path,file]);
      visiting.delete(file);done.add(file);
    }
    for(const file of Object.keys(inputs))visit(file,[]);
    expect(done.size).toBeGreaterThan(10);
  });
});
