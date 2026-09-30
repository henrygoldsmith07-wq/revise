/** Committed state subscriptions. Pure and independently testable. */
export function createSubscriptionStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

export function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) &&
    Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

/** Cache a selector's result by equality so useSyncExternalStore sees a stable
 * snapshot even for explicit selectors returning a small object or tuple. */
export function selectSnapshot<T, S>(getSnapshot: () => T, selector: (value: T) => S, equal: (a: S, b: S) => boolean) {
  let initialized = false;
  let selected: S;
  return () => {
    const next = selector(getSnapshot());
    if (!initialized || !equal(selected, next)) { selected = next; initialized = true; }
    return selected;
  };
}
