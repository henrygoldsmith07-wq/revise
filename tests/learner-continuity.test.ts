import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, getDb, putOne } from "@/data/db";
import { writeLearnerHistory, applyLearnerHistory, migrateLearnerHistory, readLearnerHistory } from "@/data/learner-history";
import { applyDeletionPage, deleteReplicaRows } from "@/data/sync-deletions";
import { syncWireId } from "@/data/sync-contract";
import { historyStorageKey, mergeHistoryRecord, validateHistoryRecord, validateHistoryValue, type LearnerHistoryRecord } from "@/domain/learner-history";
import { nextLamport, peekLamport, getDeviceIdentity } from "@/data/device";
import { createCard } from "@/domain/scheduling";
import { collapseOutboxItems } from "@/data/sync";
vi.mock("@/data/supabase", () => ({isSupabaseConfigured:true}));
const A = "11111111-1111-4111-8111-111111111111";
const at = "2026-09-30T12:00:00Z";
const actual = (id:string) => ({id,anonId:A,subjectId:"reference",percent:60,kind:"mock",takenAt:at});
const envelope = (id:string,lamport=1):LearnerHistoryRecord => ({id:`gradeActuals:${id}`,recordId:id,userId:A,kind:"gradeActuals",value:actual(id),deleted:false,lamport,deviceId:"device-b"});
beforeEach(async () => {await clearAll();});
describe("offline learner continuity", () => {
  it("allocates distinct clocks and one device identity under concurrent calls",async () => {
    const values = await Promise.all(Array.from({length:100},()=>nextLamport()));
    expect(new Set(values).size).toBe(100);
    expect(await peekLamport()).toBe(100);
    const devices = await Promise.all(Array.from({length:20},()=>getDeviceIdentity()));
    expect(new Set(devices.map(device=>device.deviceId)).size).toBe(1);
  });
  it("migrates exact legacy values, retains rows from both devices and is replay-idempotent",async () => {
    const db=await getDb();
    await db.put("meta",{key:"revise.gradeActuals.v1",value:[actual("a")]});
    await migrateLearnerHistory(A);
    await applyLearnerHistory(envelope("b",50),A);
    await writeLearnerHistory("gradeActuals",A,[actual("a")]);
    expect((await db.get("meta","revise.gradeActuals.v1"))?.value).toEqual([actual("a"),actual("b")]);
    const queued=await db.count("outbox");
    await migrateLearnerHistory(A);
    expect(await db.count("outbox")).toBe(queued);
    expect(await peekLamport()).toBeGreaterThanOrEqual(50);
  });
  it("retains terminal outcome deletions against any later stale-device stamp",async () => {
    const db=await getDb();
    await writeLearnerHistory("gradeActuals",A,[actual("a")]);
    await writeLearnerHistory("gradeActuals",A,[],["a"]);
    await applyLearnerHistory(envelope("a",100000),A);
    await writeLearnerHistory("gradeActuals",A,[actual("a")]);
    expect((await db.get("meta","revise.gradeActuals.v1"))?.value).toEqual([]);
    expect(((await db.get("meta",historyStorageKey("gradeActuals:a")))?.value as LearnerHistoryRecord).deleted).toBe(true);
    // An older tab's array write cannot revive a deleted result in calibration.
    await db.put("meta",{key:"revise.gradeActuals.v1",value:[actual("a")]});
    expect(await readLearnerHistory("gradeActuals",A)).toEqual([]);
    await migrateLearnerHistory(A);
    expect((await db.get("meta","revise.gradeActuals.v1"))?.value).toEqual([]);
  });
  it("rejects mixed owners, contradictory IDs and malformed evidence before mutation", async () => {
    await expect(writeLearnerHistory("gradeActuals",A,[actual("good"),{...actual("bad"),anonId:"other"}])).rejects.toThrow(/Mixed-owner/);
    expect(await (await getDb()).count("meta")).toBe(0);
    expect(()=>validateHistoryRecord({...envelope("a"),value:actual("b")},A)).toThrow(/Contradictory/);
    expect(()=>validateHistoryValue("interventionOutcomes",{id:"bad",userId:A,subjectId:"s"},A)).toThrow();
  });
  it("rejects future rewrites of sit-time predictions without losing existing evidence", () => {
    const original:LearnerHistoryRecord={...envelope("p"),id:"paperOutcomes:p",kind:"paperOutcomes",value:{id:"p",userId:A,subjectId:"s",paperId:"paper",predictedMarks:7,totalMarks:10,actualMarks:-1,satAt:at}};
    expect(()=>mergeHistoryRecord(original,{...original,lamport:2,value:{...original.value,predictedMarks:8}})).toThrow(/Frozen/);
    expect(mergeHistoryRecord(original,{...original,lamport:2,value:{...original.value,actualMarks:6}}).value?.actualMarks).toBe(6);
  });
  it("commits local deletions with suppression and remote intent atomically",async () => {
    const db=await getDb();
    const card=createCard({id:"content:card",userId:A,subjectId:"s",topicId:"t",front:"Q",back:"A"});
    await putOne("cards",card);
    await deleteReplicaRows("cards",[card.id],A);
    expect(await db.get("cards",card.id)).toBeUndefined();
    expect((await db.getAll("outbox"))[0].op).toBe("delete");
    await expect(putOne("cards",card)).rejects.toThrow(/deleted/);
  });
  it("suppresses exact educational IDs from encrypted legacy wire-only deletions",async () => {
    const db=await getDb();
    const card=createCard({id:"content:encrypted",userId:A,subjectId:"s",topicId:"t",front:"Q",back:"A"});
    await putOne("cards",card);
    await applyDeletionPage([{user_id:A,table_name:"cards",row_id:await syncWireId(A,card.id),local_id:null}],A);
    expect(await db.get("cards",card.id)).toBeUndefined();
    await expect(putOne("cards",card)).rejects.toThrow(/deleted/);
    await expect(applyDeletionPage([{user_id:"other",table_name:"cards",row_id:card.id,local_id:card.id}],A)).rejects.toThrow(/owner/);
  });
  it("terminal legacy deletes dominate queued higher-clock upserts",()=>{
    const base={id:"delete",entity:"cards" as const,op:"delete" as const,payload:{id:"row",userId:A},ownerId:A,queuedAt:at,attempts:0,lamport:1};
    expect(collapseOutboxItems([base,{...base,id:"stale",op:"upsert",lamport:100}])[0].op).toBe("delete");
  });
});

describe("portable terminal intent", () => {
  it("exports deletion markers and rejects a stale snapshot atomically", async () => {
    const {exportContinuityDeletions}=await import("@/data/learner-history");
    const {buildPortabilitySnapshot}=await import("@/domain/portability");
    const {restorePortableSnapshot}=await import("@/data/portable-restore");
    const card=createCard({id:"stale-import",userId:A,subjectId:"s",topicId:"t",front:"Q",back:"A"});
    await putOne("cards",card);
    await deleteReplicaRows("cards",[card.id],A);
    await writeLearnerHistory("gradeActuals",A,[actual("deleted-outcome")]);
    await writeLearnerHistory("gradeActuals",A,[],["deleted-outcome"]);
    const continuity=await exportContinuityDeletions(A);
    expect(continuity.deletions).toHaveLength(1);
    expect(continuity.learnerHistoryDeletions).toHaveLength(1);
    const snap=buildPortabilitySnapshot({userId:A,cards:[card],attempts:[],reviewLogs:[],mistakes:[],plannedSessions:[],examDates:[]});
    await expect(restorePortableSnapshot(snap,A)).rejects.toThrow(/deleted id/);
    expect(await (await getDb()).get("cards",card.id)).toBeUndefined();
    expect(await (await getDb()).count("outbox")).toBe(3);
  });
});

describe("seed deletion suppression",()=>{
  it("keeps deleted seeded curriculum rows deleted across reloads and bank top-ups",async()=>{
    const {ensureSeeded}=await import("@/data/repository");
    await ensureSeeded(A);
    const db=await getDb();
    const card=(await db.getAll("cards"))[0]!;
    await applyDeletionPage([{user_id:A,table_name:"cards",row_id:await syncWireId(A,card.id),local_id:null}],A);
    await ensureSeeded(A);
    expect(await db.get("cards",card.id)).toBeUndefined();
  },15000);
});
