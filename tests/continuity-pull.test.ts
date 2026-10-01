import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { pullContinuity, ContinuityPullError } from "@/data/sync-continuity";
import { writeLearnerHistory, readLearnerHistory } from "@/data/learner-history";
import { sync } from "@/data/sync";
import { encryptPayload } from "@/data/e2ee";
import { syncWireId } from "@/data/sync-contract";
import type { LearnerHistoryRecord } from "@/domain/learner-history";
const A="11111111-1111-4111-8111-111111111111";
vi.mock("@/data/supabase", () => ({ isSupabaseConfigured: true, getSupabase: () => null }));
const cursorKey=`revise.changeCursor.v1:learner_records::user:${A}`;
const record=(id:string):LearnerHistoryRecord=>({id:`gradeActuals:${id}`,recordId:id,kind:"gradeActuals",userId:A,value:{id,anonId:A,subjectId:"reference",percent:60,kind:"mock",takenAt:"2026-09-30T00:00:00Z"},deleted:false,lamport:7,deviceId:"remote"});
async function wire(row:LearnerHistoryRecord,seq:number){return {id:await syncWireId(A,row.id),user_id:A,data:row,lamport:row.lamport,device_id:row.deviceId,kind:row.kind,deleted:row.deleted,frozen_fingerprint:"",change_seq:seq};}
function client(rows:Record<string,unknown>[],owner:()=>string=()=>A, onlyTable?:string):SupabaseClient{
  return {auth:{getUser:async()=>({data:{user:{id:owner()}}})},from:(table:string)=>{
    let cursor=0;
    const query={select:()=>query,eq:()=>query,order:()=>query,gt:(_column:string,value:number)=>{cursor=value;return query;},range:async()=>({data:(!onlyTable || table === onlyTable) ? rows.filter(row=>Number(row.change_seq)>cursor) : [],error:null})};
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
  it("reports and notifies committed deletions when a later row fails", async () => {
    const target = new EventTarget();
    const priorWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { value: target, configurable: true, writable: true });
    try {
      const initial = record("deleted");
      await writeLearnerHistory("gradeActuals", A, [initial.value!]);
      let notifications = 0;
      target.addEventListener("revise:history-changed", () => { notifications++; });
      const deletion = await wire({ ...initial, deleted: true, value: null }, 10);
      const invalid = { ...await wire(record("bad"), 11), data: { invalid: true } };
      const error = await pullContinuity(client([deletion, invalid]), A, "learner_records").catch(error => error);
      expect(error).toBeInstanceOf(ContinuityPullError);
      expect(error.applied).toBe(1);
      expect(notifications).toBe(1);
      expect(await readLearnerHistory("gradeActuals", A)).toEqual([]);
      expect(await (await getDb()).get("meta", cursorKey)).toBeUndefined();
    } finally {
      if (priorWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", { value: priorWindow, configurable: true, writable: true });
    }
  });
  it("rejects contradictory transport headers and account changes without advancing",async()=>{
    const row=await wire(record("bad-header"),10);
    await expect(pullContinuity(client([{...row,lamport:999}]),A,"learner_records")).rejects.toThrow(/Contradictory/);
    let calls=0;
    await expect(pullContinuity(client([row],()=>++calls===1?A:"other"),A,"learner_records")).rejects.toThrow(/account mismatch/);
    expect(await (await getDb()).get("meta",cursorKey)).toBeUndefined();
  });
  it("returns committed partial work to the sync engine without draining queued work", async () => {
    const initial = record("partial-sync");
    await writeLearnerHistory("gradeActuals", A, [initial.value!]);
    const connection = await getDb();
    const pending = await connection.count("outbox");
    const deletion = await wire({ ...initial, deleted: true, value: null }, 10);
    const invalid = { ...await wire(record("bad-sync"), 11), data: { invalid: true } };
    const result = await sync(A, { client: client([deletion, invalid], () => A, "learner_records"), online: true });
    expect(result).toMatchObject({ failed: 1, pulled: 1, pushed: 0 });
    expect(await connection.count("outbox")).toBe(pending);
    expect(await readLearnerHistory("gradeActuals", A)).toEqual([]);
    expect(await connection.get("meta", cursorKey)).toBeUndefined();
  });
});
