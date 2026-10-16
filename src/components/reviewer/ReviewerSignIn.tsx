"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/data/supabase";
import { Button } from "@/components/ui";
import { reviewerReturnPath, signInLinkProblem, type SignInLinkProblem } from "@/lib/reviewer/return-path";

const LINK_PROBLEM_TEXT: Record<Exclude<SignInLinkProblem, null>, string> = {
  expired: "That sign-in link has expired or was already used. Send yourself a new one below.",
  "other-browser": "That sign-in link was opened in a different browser from the one that asked for it, so it cannot sign you in here. Send a new link from this browser and open it here (on a phone, open it from the same device).",
  failed: "That sign-in link did not work. Send yourself a new one below.",
};

/** Email one-time link that returns to the portal page the teacher opened. Same auth as the student app. */
export function ReviewerSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkProblem, setLinkProblem] = useState<SignInLinkProblem>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  // This gate is server-rendered before the browser client finishes the
  // magic-link exchange (the session cookie lands a moment after the page),
  // so a teacher arriving from the email used to see this sign-in form again
  // until they reloaded. Re-render the server page once a session exists; the
  // server still re-checks the session and the reviewer grant itself.
  //
  // A link that cannot sign the teacher in used to land silently on this same
  // form, so they could not tell a used link from a wrong browser. Read the
  // URL before the client consumes it and say which it was.
  useEffect(() => {
    const arrived = { search: location.search, hash: location.hash };
    const supabase = getSupabase();
    if (!supabase) return;
    let refreshed = false;
    let active = true;
    const refresh = () => { if (!refreshed) { refreshed = true; router.refresh(); } };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (session) queueMicrotask(refresh); });
    void supabase.auth.getSession().then(({ data: current }) => {
      if (current.session) refresh();
      else if (active) setLinkProblem(signInLinkProblem(arrived.search, arrived.hash));
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [router]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}${reviewerReturnPath(location.pathname, location.search)}`, shouldCreateUser: false },
    });
    setBusy(false);
    if (!error) { setLinkProblem(null); setSentTo(email.trim()); }
    setMessage(error ? "That link could not be sent. Check the address, or ask the maintainer to invite you." : "Check your email for a sign-in link, and open it in this browser.");
  }

  // The same email can carry a one-time code (when the maintainer's Supabase
  // email template includes {{ .Token }}; docs/review-workflow.md). A code
  // works on any device, so a teacher who reads school email on a phone but
  // reviews on a laptop is not stuck with a link that only works in the
  // browser that asked for it. Same account rules: no account is created.
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    const token = code.replace(/\s+/g, "");
    if (!supabase || !sentTo || !/^\d{6,10}$/.test(token)) {
      setCodeMessage("Enter the digits from the email.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token, type: "email" });
    setBusy(false);
    // Success fires onAuthStateChange above, which re-renders the server page.
    setCodeMessage(error ? "That code did not work. It may have expired or been used; send a new email and use the newest code." : "Signed in. Opening the portal…");
  }

  return (
    <>
    <form onSubmit={(event) => void send(event)} className="space-y-2" aria-describedby="reviewer-signin-status">
      {linkProblem ? (
        <p role="alert" className="text-xs text-ink2 rounded-md border border-line bg-surface2/40 px-2 py-1.5">
          {LINK_PROBLEM_TEXT[linkProblem]}
        </p>
      ) : null}
      <label htmlFor="reviewer-email" className="block text-xs font-medium text-ink2">School email</label>
      <div className="flex gap-2">
        <input
          id="reviewer-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="field text-sm flex-1"
          placeholder="you@school.org"
        />
        <Button type="submit" variant="primary" disabled={busy || !email.trim()}>Send link</Button>
      </div>
      <p id="reviewer-signin-status" role="status" aria-live="polite" className="text-xs text-ink3">{message}</p>
    </form>
    {sentTo ? (
      <form onSubmit={(event) => void verifyCode(event)} className="space-y-2 pt-1" aria-describedby="reviewer-code-help reviewer-code-status">
        <label htmlFor="reviewer-code" className="block text-xs font-medium text-ink2">Code from the email</label>
        <p id="reviewer-code-help" className="text-[11px] text-ink3">If the email shows a code, you can type it here instead of opening the link. It works even if you read your email on another device.</p>
        <div className="flex gap-2">
          <input
            id="reviewer-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="field text-sm flex-1 tabular-nums"
            placeholder="123456"
          />
          <Button type="submit" variant="secondary" disabled={busy || !code.trim()}>Sign in</Button>
        </div>
        <p id="reviewer-code-status" role="status" aria-live="polite" className="text-xs text-ink3">{codeMessage}</p>
      </form>
    ) : null}
    </>
  );
}
