"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { ShortcutProvider } from "@/components/shortcuts";
import { isReviewerPath } from "@/lib/reviewer/return-path";
import { AccountBoundary } from "@/state/account";

/**
 * Which shell a route renders in.
 *
 * The student app (everything except the reviewer portal) needs the account
 * boundary, the IndexedDB store and the app shell: they open the learner's
 * profile, install the seed cards and show onboarding to a fresh profile.
 *
 * The reviewer portal (/reviewer/**) is a signed-in, server-rendered tool for
 * teachers. Wrapped in the student shell, a teacher opening an invite link in
 * a fresh browser was shown "Opening your revision profile…", then (once
 * signed in) "Use your local revision?", then the student onboarding asking
 * for their subjects and exam date, before the portal ever appeared; and the
 * portal's server HTML was never sent, because the account boundary renders a
 * placeholder until a client effect resolves. The portal now renders on its
 * own: no learner profile, no IndexedDB, no student sync for a teacher's
 * account. Every portal page and API still re-checks the session and the
 * reviewer grant on the server, and RLS enforces the same rule on the data.
 */
export function RouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isReviewerPath(pathname)) return <ShortcutProvider>{children}</ShortcutProvider>;
  return (
    <>
      <DatabaseNotice />
      <AccountBoundary>
        <ShortcutProvider>
          <AppShell>{children}</AppShell>
        </ShortcutProvider>
      </AccountBoundary>
    </>
  );
}
