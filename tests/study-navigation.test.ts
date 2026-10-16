import { describe, expect, it } from "vitest";
import { adaptiveReturnHref, plannedSessionHref, resolveLessonSubject } from "@/domain/study-navigation";
import type { PlannedSession } from "@/domain/types";

describe("scoped study navigation", () => {
  it("opens a linked topic before a remembered subject without enrolling a new subject", () => {
    const input = { enrolledSubjectIds: ["chemistry", "physics"], topicSubject: "physics", rememberedSubject: "chemistry" };
    expect(resolveLessonSubject(input)).toBe("physics");
    expect(resolveLessonSubject({ ...input, requestedSubject: "chemistry" })).toBe("chemistry");
    expect(resolveLessonSubject({ ...input, topicSubject: "unknown" })).toBe("chemistry");
    expect(resolveLessonSubject({ ...input, enrolledSubjectIds: [] })).toBe("");
    expect(resolveLessonSubject({ ...input, topicSubject: null, rememberedSubject: "" })).toBe("chemistry");
  });
  it.each(["flashcards", "recall", "practice"] as const)("preserves subject/topic and completion identity for %s", activity => {
    const href = plannedSessionHref({ id: "block / 2", subjectId: "physics", topicId: "p:2", activity } as PlannedSession);
    const url = new URL(href, "https://revise.invalid");
    expect(url.searchParams.get("subject")).toBe("physics");
    expect(url.searchParams.get("topic")).toBe("p:2");
    expect(url.searchParams.get("session")).toBe("block / 2");
    expect(url.searchParams.get("mode")).toBe(activity === "recall" ? "recall" : null);
  });
  it("does not mistake a subject ID for a topic or claim unsupported auto-completion", () => {
    const practice = new URL(plannedSessionHref({ id: "block", subjectId: "physics", activity: "practice" } as PlannedSession), "https://revise.invalid");
    expect(practice.searchParams.get("subject")).toBe("physics");
    expect(practice.searchParams.has("topic")).toBe(false);
    for (const activity of ["learn", "paper", "mistakes"] as const) {
      expect(new URL(plannedSessionHref({ id: "block", subjectId: "physics", topicId: "p:2", activity } as PlannedSession), "https://revise.invalid").searchParams.has("session")).toBe(false);
    }
  });
  it("accepts only the actual adaptive destination and strips extraneous capabilities", () => {
    expect(adaptiveReturnHref("/adaptive-session?topic=p%3A2&start=1&resume=1")).toBe("/adaptive-session?topic=p%3A2&start=1&resume=1");
    expect(adaptiveReturnHref("/adaptive-session?redirect=https://evil.test#fake")).toBe("/adaptive-session");
    for (const value of [null, "", "javascript:alert(1)", "https://evil.test", "//evil.test/adaptive-session", "/\\evil.test/adaptive-session", "/settings", "/adaptive-session-extra"]) expect(adaptiveReturnHref(value)).toBeNull();
  });
});
