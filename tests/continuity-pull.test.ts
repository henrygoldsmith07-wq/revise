import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { pullContinuity } from "@/data/sync-continuity";
import { encryptPayload } from "@/data/e2ee";
import { syncWireId } from "@/data/sync-contract";
import type { LearnerHistoryRecord } from "@/domain/learner-history";
const A="11111111-1111-4111-8111-111111111111";
const cursorKey=`revise.changeCursor.v1:learner_records::user:${A}`;
const record=(id:string):LearnerHistoryRecord=>({id:`gradeActuals:${id}`,recordId:id,kind:"gradeActuals",userId:A,value:{id,anonId:A,subjectId:"reference",percent:60,kind:"mock",takenAt:"2026-09-30T00:00:00Z"},deleted:false,lamport:7,deviceId:"remote"});
async function wire(row:LearnerHistoryRecord,seq:number){return {id:await syncWireId(A,row.id),user_id:A,data:row,lamport:row.lamport,device_id:row.deviceId,kind:row.kind,deleted:row.deleted,frozen_fingerprint:"",change_seq:seq};}
function client(rows:Record<string,unknown>[],owner:()=>string=()=>A):SupabaseClient{
  return {auth:{getUser:async()=>({data:{user:{id:owner()}}})},from:()=>{
    let cursor=0;
    const query={select:()=>query,eq:()=>query,order:()=>query,gt:(_column:string,value:number)=>{cursor=value;return query;},range:async()=>({data:rows.filter(row=>Number(row.change_seq)>cursor),error:null})};
    return query;
  }} as unknown as SupabaseClient;
}
beforeEach(async()=>{await clearAll();});
describe("validated continuity pages",()=>{
  it("pulls encrypted row evidence without losing headers or unknown trust",async()=>{
    const original=record("encrypted");
    const header=await wire(original,10);
    const data=await encryptPayload(original);
    expect(await pullContinuity(client([{...header,data}]),A,"learner_records")).toBe(1);
    expect((await (await getDb()).get("meta","revise.gradeActuals.v1"))?.value).toEqual([original.value]);
    expect((await (await getDb()).get("meta",cursorKey))?.value).toBe(10);
    expect(await pullContinuity(client([{...header,data}]),A,"learner_records")).toBe(0);
  });
  it("pins a malformed page and replays its partial work idempotently",async()=>{
    const good=await wire(record("first"),10),second=await wire(record("second"),11);
    await expect(pullContinuity(client([good,{...second,user_id:"other"}]),A,"learner_records")).rejects.toThrow(/ownership/);
    expect(await (await getDb()).get("meta",cursorKey)).toBeUndefined();
    expect(await pullContinuity(client([good,second]),A,"learner_records")).toBe(2);
    expect((await (await getDb()).get("meta","revise.gradeActuals.v1"))?.value).toEqual([record("first").value,record("second").value]);
  });
  it("rejects contradictory transport headers and account changes without advancing",async()=>{
    const row=await wire(record("bad-header"),10);
    await expect(pullContinuity(client([{...row,lamport:999}]),A,"learner_records")).rejects.toThrow(/Contradictory/);
    let calls=0;
    await expect(pullContinuity(client([row],()=>++calls===1?A:"other"),A,"learner_records")).rejects.toThrow(/account mismatch/);
    expect(await (await getDb()).get("meta",cursorKey)).toBeUndefined();
  });
});
