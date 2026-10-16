import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { createCard } from "@/domain/scheduling";

// A focused hook harness exercises the real component handlers without a DOM.
// State changes are committed on render(), just as a second queued activation
// can arrive before React has committed a disabled button.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[], shortcuts: [] as {key: string; run: () => void; disabled?: boolean}[] }));
const storage = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react,
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.slots)) hooks.slots[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.slots[i], (next: unknown) => { hooks.slots[i] = typeof next === "function" ? (next as (previous: unknown) => unknown)(hooks.slots[i]) : next; }];
    },
    useRef: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.slots)) hooks.slots[i] = { current: initial };
      return hooks.slots[i];
    },
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => void, deps: unknown[]) => {
      const i = hooks.cursor++;
      const previous = hooks.slots[i] as unknown[] | undefined;
      if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) {
        hooks.slots[i] = deps;
        hooks.effects.push(fn);
      }
    },
  };
});
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/state/store", () => ({ useStoreFields: () => storage.store }));
vi.mock("@/components/shortcuts", () => ({ useShortcuts: (shortcuts: typeof hooks.shortcuts) => { hooks.shortcuts = shortcuts; } }));
import ReviewPage from "@/app/review/page";
import { AdaptiveRetrievalBlock } from "@/components/AdaptiveRetrievalBlock";

type Element = ReactElement<{children?: ReactNode; onClick?: () => void; disabled?: boolean; role?: string}>;
function elements(node: ReactNode): Element[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const element = node as Element;
  return [element, ...elements(element.props?.children)];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" ? text((node as Element).props?.children) : "";
}
function button(tree: ReactNode, label: string): Element {
  const found = elements(tree).find((element) => element.props?.onClick && text(element.props.children).startsWith(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function harness(renderComponent: () => ReactNode) {
  return () => {
    hooks.cursor = 0;
    const tree = renderComponent();
    hooks.effects.splice(0).forEach((effect) => effect());
    return tree;
  };
}
const card = createCard({id:"card",userId:"local",subjectId:"s",topicId:"t",front:"Question",back:"Answer"});
beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.effects = []; hooks.shortcuts = [];
  storage.store = { userId: "local", cards: [card], settings: { subjectIds: ["s"], sessionLengthMinutes: 1 },
    questions: [], attempts: [], mistakes: [], revisionCheckpoint: null,
    reviewCard: vi.fn(async () => {}), updateCards: vi.fn(async () => {}),
    saveRevisionCheckpoint: vi.fn(async () => {}), clearRevisionCheckpoint: vi.fn(async () => {}) };
});

function reviewHarness() {
  const page = ReviewPage() as ReactElement<{children: ReactElement}>;
  const Session = page.props.children.type as () => ReactNode;
  return harness(Session);
}
function pendingSave() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  storage.store.reviewCard = vi.fn(() => promise);
  return { resolve, reject, save: storage.store.reviewCard as ReturnType<typeof vi.fn> };
}

describe("retrieval activation and failed-save retention", () => {
  it("review allows only one pointer/keyboard grade while its save is pending", async () => {
    const { resolve, save } = pendingSave();
    const render = reviewHarness();
    button(render(), "Show answer").props.onClick!();
    const shown = render();
    button(shown, "Good").props.onClick!();
    hooks.shortcuts.find((shortcut) => shortcut.key === "3")!.run();
    button(shown, "Again").props.onClick!();
    expect(save).toHaveBeenCalledTimes(1);
    expect(button(render(), "Good").props.disabled).toBe(true);
    resolve();
    await vi.waitFor(() => expect((render() as ReactElement<{reviewed: number}>).props.reviewed).toBe(1));
  });
  it("review retains the revealed card and unlocks retry after a failed save", async () => {
    const { reject, save } = pendingSave();
    const render = reviewHarness();
    button(render(), "Show answer").props.onClick!();
    button(render(), "Good").props.onClick!();
    reject(new Error("disk full"));
    await vi.waitFor(() => expect(text(render())).toContain("Could not save your grade"));
    expect(text(render())).toContain("Question");
    expect(button(render(), "Good").props.disabled).toBe(false);
    save.mockResolvedValue(undefined);
    button(render(), "Good").props.onClick!();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });
  it("review Again repeats an ID and reads the latest committed card on the next reveal", async () => {
    const save = storage.store.reviewCard as ReturnType<typeof vi.fn>;
    save.mockImplementation(async () => { storage.store.cards = [{ ...card, reps: 1, log: [] }]; });
    const render = reviewHarness();
    button(render(), "Show answer").props.onClick!();
    button(render(), "Again").props.onClick!();
    await vi.waitFor(() => expect(button(render(), "Show answer")).toBeDefined());
    button(render(), "Show answer").props.onClick!();
    button(render(), "Good").props.onClick!();
    expect(save.mock.calls[1][0].reps).toBe(1);
  });
  it("adaptive retrieval blocks duplicate activation and retains the card on rejection", async () => {
    const { reject, save } = pendingSave();
    const complete = vi.fn();
    const render = harness(() => AdaptiveRetrievalBlock({cards:[card],onComplete:complete}));
    button(render(), "Show answer").props.onClick!();
    const shown = render();
    button(shown, "Good").props.onClick!(); button(shown, "Again").props.onClick!();
    expect(save).toHaveBeenCalledTimes(1);
    reject(new Error("disk full"));
    await vi.waitFor(() => expect(text(render())).toContain("Could not save your grade"));
    expect(text(render())).toContain("Question");
    expect(complete).not.toHaveBeenCalled();
    save.mockResolvedValue(undefined);
    button(render(), "Good").props.onClick!();
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("adaptive retries a failed completion without grading the last card twice", async () => {
    const complete = vi.fn().mockRejectedValueOnce(new Error("save failed")).mockResolvedValue(undefined);
    const render = harness(() => AdaptiveRetrievalBlock({cards:[card],onComplete:complete}));
    button(render(), "Show answer").props.onClick!();
    button(render(), "Good").props.onClick!();
    await vi.waitFor(() => expect(text(render())).toContain("Your grades are saved"));
    const retry = button(render(), "Try finishing again");
    retry.props.onClick!(); retry.props.onClick!();
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
    expect(storage.store.reviewCard).toHaveBeenCalledTimes(1);
  });
});
