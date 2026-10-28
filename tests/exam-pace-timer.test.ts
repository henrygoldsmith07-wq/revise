import { describe, expect, it } from "vitest";
import { examPaceState, examPaceTargetSeconds, formatClock, EXAM_SECONDS_PER_MARK } from "@/domain/practice-step-mode";

// The timed step's clock (src/components/ExamPaceTimer.tsx) froze by copying
// ticking state into a second state during render, so the frozen reading
// could lag a full tick behind the moment marking landed. The pace maths it
// displays is pinned here: 90 seconds a mark, over only past the target, and
// the m:ss face a student reads at a glance.

describe("exam pace maths", () => {
  it("gives each mark 90 seconds and never a zero target", () => {
    expect(EXAM_SECONDS_PER_MARK).toBe(90);
    expect(examPaceTargetSeconds(1)).toBe(90);
    expect(examPaceTargetSeconds(4)).toBe(360);
    expect(examPaceTargetSeconds(0)).toBe(90);
  });

  it("turns over only past the target, not at it", () => {
    expect(examPaceState(360, 360)).toBe("on-pace");
    expect(examPaceState(361, 360)).toBe("over");
    expect(examPaceState(0, 90)).toBe("on-pace");
  });

  it("formats m:ss for the clock face, clamping negatives", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3600)).toBe("60:00");
    expect(formatClock(-3)).toBe("0:00");
  });

  it("computes the over-pace byline from the same numbers the clock shows", () => {
    // "Over exam pace by m:ss" is formatClock(shown - target): the delta has
    // to be the shown reading minus the target, or the byline disagrees with
    // the clock beside it.
    const shown = 400;
    const target = examPaceTargetSeconds(4);
    expect(formatClock(shown - target)).toBe("0:40");
  });
});
