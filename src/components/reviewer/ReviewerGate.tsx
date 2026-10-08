import { ReviewerSignIn } from "./ReviewerSignIn";

/** What a non-reviewer sees. Server component; reveals nothing about the queue. */
export function ReviewerGate({ status, email }: { status: "unconfigured" | "signed-out" | "not-reviewer"; email?: string | null }) {
  return (
    <main className="mx-auto max-w-md card p-5 space-y-3" aria-labelledby="gate-title">
      <h1 id="gate-title" className="text-lg font-semibold tracking-tight text-ink">Reviewer portal</h1>
      {status === "unconfigured" ? (
        <p className="text-sm text-ink2">Reviewer accounts are not configured on this deployment.</p>
      ) : status === "signed-out" ? (
        <>
          <p className="text-sm text-ink2">For teachers and examiners checking questions before students rely on them. Sign in with the email your access was granted to.</p>
          <ReviewerSignIn />
        </>
      ) : (
        <p className="text-sm text-ink2">
          {email ? <>You are signed in as <span className="font-medium text-ink">{email}</span>, but this</> : "This"} account has not been granted reviewer access.
          Access is granted by the Revise maintainer; it cannot be requested from here.
        </p>
      )}
    </main>
  );
}
