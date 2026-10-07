import { describe, expect, it } from "vitest";
import { MAX_PROVEN_MOMENTS, newlyProvenTopics, nextSeenProofStates, parseSeenProofStates } from "@/domain/proof-moment";

describe("proof moment", () => {
  it("celebrates a topic that moved from awaiting proof to proven", () => {
    expect(newlyProvenTopics({ t1: "awaiting-proof" }, [{ topicId: "t1", state: "proven" }])).toEqual(["t1"]);
  });

  it("does not celebrate a topic already seen as proven, or one not proven", () => {
    expect(
      newlyProvenTopics({ t1: "proven", t2: "awaiting-proof" }, [
        { topicId: "t1", state: "proven" },
        { topicId: "t2", state: "awaiting-proof" },
      ]),
    ).toEqual([]);
  });

  it("caps how many topics animate at once", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ topicId: `t${i}`, state: "proven" as const }));
    expect(newlyProvenTopics({}, rows)).toHaveLength(MAX_PROVEN_MOMENTS);
  });

  it("records every topic's current state for next time", () => {
    expect(nextSeenProofStates({ old: "proven" }, [{ topicId: "t1", state: "awaiting-proof" }])).toEqual({
      old: "proven",
      t1: "awaiting-proof",
    });
  });

  it("parses stored state defensively", () => {
    expect(parseSeenProofStates(null)).toEqual({});
    expect(parseSeenProofStates("not json")).toEqual({});
    expect(parseSeenProofStates("[1,2]")).toEqual({});
    expect(parseSeenProofStates(JSON.stringify({ a: "proven", b: "made-up", c: 3 }))).toEqual({ a: "proven" });
  });
});
