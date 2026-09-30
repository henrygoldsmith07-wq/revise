"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getSupabase } from "@/data/supabase";
import { bindDatabaseProfile, getDb } from "@/data/db";
import { canonicalProfile, initializeAccountProfile, needsProfileChoice, settleProfileWrites } from "@/data/account-profile";
import { StoreProvider } from "./store";

export interface AccountProfile { userId: string; email: string | null; kind: "local" | "account" }
const AccountContext = createContext<AccountProfile | null>(null);
export function useAccount(): AccountProfile {
  const profile = useContext(AccountContext);
  if (!profile) throw new Error("useAccount requires AccountBoundary.");
  return profile;
}

/** Resolve auth BEFORE any study data or global metadata is read. Databases are
 * pinned per document: switching auth hides the old tree and reloads it, so
 * asynchronous writes cannot drift into the new account's storage. */
export function AccountBoundary({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [choice, setChoice] = useState<AccountProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedProfile = useRef<string | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    let active = true;
    const client = getSupabase();
    const resolve = async (account: { id: string; email?: string } | null) => {
      const current = ++epoch.current;
      const userId = canonicalProfile(account?.id ?? null);
      const next: AccountProfile = { userId, email: account?.email ?? null, kind: account ? "account" : "local" };
      if (mountedProfile.current && mountedProfile.current !== userId) {
        setProfile(null);
        setChoice(null);
        await settleProfileWrites(await getDb());
        if (active) window.location.reload();
        return;
      }
      if (next.kind === "account" && await needsProfileChoice(userId)) {
        if (active && current === epoch.current) setChoice(next);
        return;
      }
      if (next.kind === "account") await initializeAccountProfile(userId, false);
      if (!active || current !== epoch.current) return;
      bindDatabaseProfile(userId);
      mountedProfile.current = userId;
      setChoice(null);
      setProfile(next);
    };
    const fail = (caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Could not open your profile."); };
    if (!client) { void resolve(null).catch(fail); return () => { active = false; }; }
    // Auth callbacks must return immediately; doing Supabase work inside one
    // can deadlock the client's auth lock. Resolve after the notification.
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { if (active) void resolve(session?.user ?? null).catch(fail); });
    });
    // getSession restores magic-link and offline sessions; sync separately
    // verifies the server identity on every push/pull boundary.
    const initialEpoch = epoch.current;
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (authError) throw authError;
      if (active && initialEpoch === epoch.current) return resolve(data.session?.user ?? null);
    }).catch(fail);
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function choose(adopt: boolean) {
    if (!choice) return;
    const chosen = choice;
    const current = epoch.current;
    setChoice(null);
    try {
      await initializeAccountProfile(chosen.userId, adopt);
      if (current !== epoch.current) return;
      bindDatabaseProfile(chosen.userId);
      mountedProfile.current = chosen.userId;
      setProfile(chosen);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open your profile."); }
  }

  if (error) return <div className="min-h-dvh grid place-items-center p-6"><div role="alert"><p>{error}</p><button className="btn btn-primary mt-4" onClick={() => window.location.reload()}>Try again</button></div></div>;
  if (choice) return (
    <main className="min-h-dvh grid place-items-center p-6">
      <section className="card p-6 max-w-md space-y-4" aria-labelledby="profile-choice">
        <h1 id="profile-choice" className="text-xl font-semibold">Use your local revision?</h1>
        <p>Signed in as {choice.email ?? "your account"}. Copy this device’s local revision and progress into this account, or open a separate account profile.</p>
        <p className="text-sm text-ink2">Your local copy stays on this device. Account progress syncs when you are online.</p>
        <button className="btn btn-primary" onClick={() => void choose(true)}>Copy local revision</button>
        <button className="btn btn-secondary" onClick={() => void choose(false)}>Keep profiles separate</button>
      </section>
    </main>
  );
  if (!profile) return <div className="min-h-dvh grid place-items-center" role="status">Opening your revision profile…</div>;
  return <AccountContext.Provider value={profile}><StoreProvider userId={profile.userId}>{children}</StoreProvider></AccountContext.Provider>;
}
