import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createCard } from "@/domain/scheduling";
import { buildPortabilitySnapshot } from "@/domain/portability";
import { remapPortableRecordIds } from "@/domain/portable-record-ids";
import { syncWireIdValue } from "@/data/sync-contract";

// @ts-expect-error Native ESM tooling is shared with the credentialed runner.
import { STAGING_CATALOG_SQL, STAGING_TABLES, validateStagingCatalog, validateStagingFunctions } from "../scripts/staging-contract.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
async function owner(id = A) {
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}';`);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role authenticated; create role anon;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${A}'),('${B}');`);
  const schema = readFileSync("supabase/schema.sql", "utf8");
  await db.exec(schema);
  await db.exec(schema); // additive migration remains rerunnable
  await db.exec("grant select on all tables in schema public to authenticated; grant select, insert, update, delete on public.cards to authenticated");
  await owner();
}, 30000);
afterAll(async () => { await db?.close(); });

describe("actual PostgreSQL continuity contract", () => {
  it("permits a cross-account UUID copy without colliding with or changing the source row", async () => {
    const card = createCard({ id: crypto.randomUUID(), userId: A, subjectId: "reference", topicId: "topic", front: "Source", back: "Answer" });
    const snapshot = buildPortabilitySnapshot({ userId: A, cards: [card], attempts: [], reviewLogs: [], mistakes: [], plannedSessions: [], examDates: [] });
    const copied = remapPortableRecordIds(snapshot, B).cardRecords![0]!;
    await db.query("insert into cards(id,user_id,data) values($1,$2,$3)", [syncWireIdValue(A, card.id), A, card]);
    await owner(B);
    await db.query("insert into cards(id,user_id,data) values($1,$2,$3) on conflict(id) do update set data=excluded.data", [syncWireIdValue(B, copied.id), B, { ...copied, userId: B }]);
    expect((await db.query<{data:{id:string}}>("select data from cards")).rows[0].data.id).toBe(copied.id);
    await owner();
    expect((await db.query<{data:{id:string}}>("select data from cards where id=$1", [syncWireIdValue(A, card.id)])).rows[0].data.id).toBe(card.id);
  });
  it("makes RPC deletion terminal against later legacy writes and protects markers", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into cards(id,user_id,data) values($1,$2,$3)", [id,A,{id:"content:original"}]);
    await db.query("select delete_replica_row('cards',$1,'content:original',$2)", [id,A]);
    await db.query("select delete_replica_row('cards',$1,'content:original',$2)", [id,A]);
    await db.query("insert into cards(id,user_id,data,updated_at) values($1,$2,$3,'2099-01-01') on conflict(id) do update set data=excluded.data", [id,A,{id:"content:original", stale:true}]);
    expect((await db.query("select * from cards where id=$1", [id])).rows).toHaveLength(0);
    const markers = (await db.query<{local_id:string}>("select * from sync_tombstones where row_id=$1", [id])).rows;
    expect(markers).toHaveLength(1);
    expect(markers[0].local_id).toBe("content:original");
    await expect(db.query("delete from sync_tombstones where row_id=$1", [id])).rejects.toThrow(/permission denied/);
  });
  it("retains direct deletes from encrypted legacy clients using the wire identity", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    await db.query("insert into cards(id,user_id,data) values($1,$2,$3)", [id,A,{enc:true,ciphertext:"opaque"}]);
    await db.query("delete from cards where id=$1", [id]);
    const markers = (await db.query<{local_id:null}>("select * from sync_tombstones where row_id=$1", [id])).rows;
    expect(markers[0].local_id).toBeNull();
    await db.query("insert into cards(id,user_id,data) values($1,$2,$3)", [id,A,{stale:true}]);
    expect((await db.query("select * from cards where id=$1", [id])).rows).toHaveLength(0);
  });
  it("orders history causally, freezes predictions, and makes deletion dominate any stamp", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    await db.query("insert into learner_records(id,user_id,kind,data,lamport,device_id,frozen_fingerprint) values($1,$2,'paperOutcomes',$3,8,'a','frozen')", [id,A,{actualMarks:-1}]);
    const first = (await db.query<{change_seq:number}>("select * from learner_records where id=$1",[id])).rows[0];
    await db.query("update learner_records set lamport=3, data=$2, updated_at='2099-01-01' where id=$1",[id,{actualMarks:1}]);
    expect((await db.query<{lamport:number}>("select * from learner_records where id=$1",[id])).rows[0].lamport).toBe(8);
    await expect(db.query("update learner_records set lamport=9, frozen_fingerprint='rewritten' where id=$1",[id])).rejects.toThrow(/Frozen/);
    await db.query("update learner_records set lamport=9, data=$2 where id=$1",[id,{actualMarks:7}]);
    expect((await db.query<{change_seq:number}>("select * from learner_records where id=$1",[id])).rows[0].change_seq).toBeGreaterThan(first.change_seq);
    await db.query("update learner_records set lamport=1, deleted=true, data='null' where id=$1",[id]);
    await db.query("update learner_records set lamport=100, deleted=false, data=$2 where id=$1",[id,{actualMarks:9}]);
    expect((await db.query<{deleted:boolean}>("select * from learner_records where id=$1",[id])).rows[0].deleted).toBe(true);
    await expect(db.query("delete from learner_records where id=$1",[id])).rejects.toThrow(/permission denied/);
  });
  it("enforces independent-account RLS on history, markers, and deletions", async () => {
    await owner(B);
    await expect(db.query("select delete_replica_row('cards',$1,'wrong-owner',$2)",[crypto.randomUUID(),A])).rejects.toThrow(/ownership mismatch/);
    expect((await db.query("select * from learner_records")).rows).toHaveLength(0);
    expect((await db.query("select * from sync_tombstones")).rows).toHaveLength(0);
    await expect(db.query("insert into sync_tombstones(user_id,table_name,row_id,local_id) values($1,'cards',$2,'other-owner')",[A,crypto.randomUUID()])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into learner_records(id,user_id,kind,data,lamport,device_id) values($1,$2,'gradeActuals','{}',1,'b')",[crypto.randomUUID(),A])).rejects.toThrow(/row-level security/);
    await owner();
  });
  it("validates the real migrated catalogs with the same release preflight",async()=>{
    const rows=await db.query(STAGING_CATALOG_SQL,[STAGING_TABLES]);
    expect(validateStagingCatalog(rows.rows)).toEqual([]);
    const functions=await db.query("select proname as name,prosecdef as \"securityDefiner\",pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=any($1::text[])",[["order_continuity_change","guard_replica_resurrection","record_replica_deletion","delete_replica_row"]]);
    expect(validateStagingFunctions(functions.rows)).toEqual([]);
  });

  it("allows account erasure to cascade without creating orphan deletion markers",async()=>{
    const account="66666666-6666-4666-8666-666666666666";
    await db.exec("reset role");
    await db.query("insert into auth.users(id) values($1)",[account]);
    await owner(account);
    await db.query("insert into cards(id,user_id,data) values($1,$2,'{}')",[crypto.randomUUID(),account]);
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1",[account]);
    expect((await db.query("select * from cards where user_id=$1",[account])).rows).toHaveLength(0);
    expect((await db.query("select * from sync_tombstones where user_id=$1",[account])).rows).toHaveLength(0);
    await owner();
  });

});
