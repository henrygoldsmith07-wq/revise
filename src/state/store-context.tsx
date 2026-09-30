"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { StoreValue } from "./store";
import { createSubscriptionStore, selectSnapshot, shallowEqual } from "./subscriptions";

type StoreSubscriptions = ReturnType<typeof createSubscriptionStore<StoreValue>>;
const StoreContext = createContext<StoreSubscriptions | null>(null);

/** Subscribe only to the values this view actually reads. */
export function useStoreSelector<S>(selector: (store: StoreValue) => S, equal: (a: S, b: S) => boolean = Object.is): S {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStoreSelector must be used inside <StoreProvider>");
  const getSelected = useMemo(() => selectSnapshot(store.getSnapshot, selector, equal), [store, selector, equal]);
  return useSyncExternalStore(store.subscribe, getSelected, getSelected);
}

export function useStoreFields<K extends keyof StoreValue>(...keys: K[]): Pick<StoreValue, K> {
  return useStoreSelector((value) => Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<StoreValue, K>, shallowEqual);
}

/** Compatibility for orchestration views that still need the complete model. */
export function useStore(): StoreValue {
  return useStoreSelector(identitySelector);
}
const identitySelector = (value: StoreValue) => value;

export function StoreSubscriptionsProvider({ value, children }: { value: StoreValue; children: ReactNode }) {
  const [store] = useState(() => createSubscriptionStore(value));
  useLayoutEffect(() => { store.publish(value); }, [store, value]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
