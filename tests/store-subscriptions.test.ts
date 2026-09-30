import { describe, expect, it } from "vitest";
import { createSubscriptionStore, selectSnapshot, shallowEqual } from "@/state/subscriptions";

describe("explicit store subscriptions", () => {
  it("keeps unrelated selections identical across grades, sync and settings writes", () => {
    const settings = { theme: "dark" };
    const cards = [{ id: "a" }];
    const store = createSubscriptionStore({ settings, cards, sync: "idle", outcomes: [] });
    const selectSettings = selectSnapshot(store.getSnapshot, (state) => ({ settings: state.settings }), shallowEqual);
    const selectCards = selectSnapshot(store.getSnapshot, (state) => state.cards, Object.is);
    const selectSync = selectSnapshot(store.getSnapshot, (state) => state.sync, Object.is);
    const firstSettings = selectSettings();
    const firstCards = selectCards();
    store.publish({ ...store.getSnapshot(), sync: "pending" });
    expect(selectSettings()).toBe(firstSettings);
    expect(selectCards()).toBe(firstCards);
    expect(selectSync()).toBe("pending");
    store.publish({ ...store.getSnapshot(), cards: [{ id: "graded" }] });
    expect(selectSettings()).toBe(firstSettings);
    expect(selectCards()).not.toBe(firstCards);
    const graded = selectCards();
    store.publish({ ...store.getSnapshot(), settings: { theme: "light" } });
    expect(selectCards()).toBe(graded);
    expect(selectSettings()).not.toBe(firstSettings);
  });

  it("publishes committed snapshots and cleans up subscriptions", () => {
    const store = createSubscriptionStore(0);
    const observed: number[] = [];
    const unsubscribe = store.subscribe(() => observed.push(store.getSnapshot()));
    store.publish(1); store.publish(1); unsubscribe(); store.publish(2);
    expect(observed).toEqual([1]);
  });
});
