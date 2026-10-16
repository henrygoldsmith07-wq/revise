import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ReviewerSessionKeeper } from "@/components/reviewer/ReviewerSessionKeeper";

// Reviewer portal route group. Teacher-only: every page and API behind it
// re-checks the session and the reviewer grant server-side, and Supabase RLS
// enforces the same rule on the data. Not part of the offline student shell
// (public/sw.js never caches /reviewer), and not inside the student shell
// either: RouteShell renders it without AccountBoundary/AppShell, so a teacher
// never meets the student onboarding or gets a learner profile.

export const metadata: Metadata = {
  title: "Reviewer portal — Revise",
  robots: { index: false, follow: false },
};

export default function ReviewerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <ReviewerSessionKeeper />
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4">{children}</div>
    </div>
  );
}
