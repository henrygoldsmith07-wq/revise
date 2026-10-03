import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LazyBoundary } from "@/components/LazyBoundary";

describe("lazy chunk containment", () => {
  it("turns a thrown chunk error into the fallback state", () => {
    expect(LazyBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const boundary = new LazyBoundary({ children: "child", fallback: "fallback" });
    expect(boundary.render()).toBe("child");
    boundary.state = { failed: true };
    expect(boundary.render()).toBe("fallback");
  });

  it("wraps every use of the lazily loaded roadmap on Today", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const bare = page.split("\n").filter((line) => /<TodayRoadmap[ />]/.test(line) && !line.includes("SafeTodayRoadmap"));
    expect(bare.map((line) => line.trim())).toEqual(["<TodayRoadmap preferredSubjectId={preferredSubjectId} />"]);
    expect(page).toContain("<LazyBoundary fallback={<TodayRoadmapUnavailable />}>");
  });
});
