"use client";

import { useState } from "react";
import { getSupabase } from "@/data/supabase";
import { Button } from "@/components/ui";

/** Email one-time link that returns to the portal. Same auth as the student app. */
export function ReviewerSignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/reviewer`, shouldCreateUser: false },
    });
    setBusy(false);
    setMessage(error ? "That link could not be sent. Check the address, or ask the maintainer to invite you." : "Check your email for a sign-in link.");
  }

  return (
    <form onSubmit={(event) => void send(event)} className="space-y-2" aria-describedby="reviewer-signin-status">
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
  );
}
