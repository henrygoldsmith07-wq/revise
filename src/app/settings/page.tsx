"use client";

import { useEffect, useState } from "react";
import { aiStatus } from "@/ai/client";
import { allSubjects, subjectLabel } from "@/domain/curriculum";
import { buildPortabilitySnapshot, deletionPreview, portabilityFilename, privacyDisclosure } from "@/domain/portability";
import { clearAll } from "@/data/db";
import { getSupabase, isSupabaseConfigured } from "@/data/supabase";
import { useStore } from "@/state/store";
import { Button, Field, Panel, Pill, SectionHeading, Segmented } from "@/components/ui";
import Link from "next/link";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const store = useStore();
  const { settings } = store;
  const [ai, setAi] = useState<{ available: boolean; name: string | null } | null>(null);

  useEffect(() => {
    void aiStatus().then(setAi);
  }, []);

  const totalWeeklyMinutes = settings.availability.reduce((a, row) => a + row.minutes, 0);

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-ink3 mt-0.5">Everything here changes what the planner and recommender do next.</p>
      </header>

      <section>
        <SectionHeading title="You" />
        <Panel className="space-y-3">
          <Field label="Display name">
            <input
              value={settings.displayName}
              onChange={(e) => void store.updateSettings({ displayName: e.target.value })}
              className="field text-sm"
            />
          </Field>
          <Field label="Session length" hint="How long one block of revision runs.">
            <Segmented
              ariaLabel="Session length"
              value={String(settings.sessionLengthMinutes)}
              onChange={(value) => void store.updateSettings({ sessionLengthMinutes: Number(value) })}
              options={[
                { value: "15", label: "15 min" },
                { value: "25", label: "25 min" },
                { value: "40", label: "40 min" },
                { value: "60", label: "60 min" },
              ]}
            />
          </Field>
        </Panel>
      </section>

      <section>
        <SectionHeading title="Subjects" hint="Only these are planned, recommended and predicted." />
        <Panel>
          <ul className="space-y-2">
            {allSubjects().map((subject) => {
              const on = settings.subjectIds.includes(subject.id);
              return (
                <li key={subject.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{subject.name}</p>
                    <p className="text-[11px] text-ink3 truncate">
                      {subjectLabel(subject.id)}
                      {subject.specCode ? ` · ${subject.specCode}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={on ? "primary" : "secondary"}
                    onClick={() =>
                      void store.updateSettings({
                        subjectIds: on
                          ? settings.subjectIds.filter((id) => id !== subject.id)
                          : [...settings.subjectIds, subject.id],
                      })
                    }
                  >
                    {on ? "Taking" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>

      <section>
        <SectionHeading
          title="Available study time"
          hint={`${Math.round(totalWeeklyMinutes / 60)} hours a week. The planner never schedules more than this.`}
        />
        <Panel>
          <ul className="space-y-2.5">
            {WEEKDAYS.map((name, weekday) => {
              const minutes = settings.availability.find((a) => a.weekday === weekday)?.minutes ?? 0;
              return (
                <li key={weekday} className="flex items-center gap-3">
                  <span className="text-sm text-ink2 w-24 shrink-0">{name}</span>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={15}
                    value={minutes}
                    onChange={(e) =>
                      void store.updateSettings({
                        availability: WEEKDAYS.map((_, day) => ({
                          weekday: day,
                          minutes:
                            day === weekday
                              ? Number(e.target.value)
                              : (settings.availability.find((a) => a.weekday === day)?.minutes ?? 0),
                        })),
                      })
                    }
                    className="flex-1 accent-[var(--accent)]"
                    aria-label={`${name} study minutes`}
                  />
                  <span className="text-xs text-ink3 tabular-nums w-16 text-right">
                    {minutes ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : "none"}
                  </span>
                </li>
              );
            })}
          </ul>
          <Button className="mt-4" onClick={() => void store.regeneratePlan()}>
            Rebuild plan with these hours
          </Button>
        </Panel>
      </section>

      <section>
        <SectionHeading title="Appearance and accessibility" />
        <Panel className="space-y-4">
          <Field label="Theme">
            <Segmented
              ariaLabel="Theme"
              value={settings.theme}
              onChange={(value) => {
                void store.updateSettings({ theme: value as "light" | "dark" | "system" });
                // Mirrored to localStorage so the pre-paint script in the
                // layout picks the right theme on the next cold load.
                try {
                  localStorage.setItem("revise.theme", value);
                } catch {
                  /* private browsing — the in-app preference still applies */
                }
              }}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
            />
          </Field>
          <ul className="space-y-2">
            {(
              [
                ["largeText", "Larger text", "Scales the whole interface up by 12.5%."],
                ["dyslexiaFont", "Dyslexia-friendly text", "Wider spacing and a rounder typeface."],
                ["highContrast", "High contrast", "Maximum contrast between text and background."],
                ["reduceMotion", "Reduce motion", "Removes animation and transitions."],
              ] as const
            ).map(([key, label, hint]) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-ink">{label}</p>
                  <p className="text-[11px] text-ink3">{hint}</p>
                </div>
                <Button
                  size="sm"
                  variant={settings.accessibility[key] ? "primary" : "secondary"}
                  aria-pressed={settings.accessibility[key]}
                  onClick={() =>
                    void store.updateSettings({
                      accessibility: { ...settings.accessibility, [key]: !settings.accessibility[key] },
                    })
                  }
                >
                  {settings.accessibility[key] ? "On" : "Off"}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section>
        <SectionHeading title="AI" hint="The app is fully usable without it." />
        <Panel>
          <div className="flex items-center gap-2">
            {ai?.available ? (
              <Pill tone="success">Connected · {ai.name}</Pill>
            ) : (
              <Pill tone="review">No provider configured</Pill>
            )}
          </div>
          <p className="text-sm text-ink3 mt-2">
            {ai?.available
              ? "Explanations, marking, generation and OCR use the configured provider. Keys stay on the server and are never sent to the browser."
              : "Marking falls back to the mark scheme on this device, explanations come from the stored spec content, and question generation serves the authored bank. Set AI_PROVIDER and a key on the server to enable the model-backed versions."}
          </p>
        </Panel>
      </section>

      <Account />

      <DataControls />

      <section>
        <SectionHeading title="Pulse" hint="Off by default. Nothing is shared until you switch it on." />
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink">Share study history with Pulse</p>
              <p className="text-[11px] text-ink3 mt-0.5">
                When on, Pulse can connect to this account and correlate your reviews and attempts with outcomes
                like mood or study accuracy. Turning it off revokes access immediately — Pulse is refused at the
                source until it is switched back on.
              </p>
            </div>
            <Button
              size="sm"
              variant={settings.pulseEnabled ? "primary" : "secondary"}
              aria-pressed={settings.pulseEnabled}
              onClick={() => void store.updateSettings({ pulseEnabled: !settings.pulseEnabled })}
            >
              {settings.pulseEnabled ? "On" : "Off"}
            </Button>
          </div>
        </Panel>
      </section>

      <section>
        <SectionHeading title="Privacy" hint="What leaves this device, and what never does." />
        <Panel>
          <ul className="text-xs text-ink2 space-y-1 list-disc list-inside">
            {privacyDisclosure(isSupabaseConfigured).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-[11px] text-ink3 mt-3">
            More: <Link className="underline" href="/benchmarks">Benchmarks</Link> ·{" "}
            <Link className="underline" href="/case-study">Case study</Link> ·{" "}
            <a className="underline" href="/docs/benchmark.md">Benchmark docs</a>
          </p>
        </Panel>
      </section>
    </div>
  );
}

function Account() {
  const store = useStore();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null));
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <section>
        <SectionHeading title="Account" />
        <Panel>
          <Pill>Local profile</Pill>
          <p className="text-sm text-ink3 mt-2">
            No backend is configured, so this device holds a single local profile. Everything works — cards, marking,
            planning, analytics — but nothing syncs to another device. Set the Supabase environment variables to turn
            on accounts and sync.
          </p>
        </Panel>
      </section>
    );
  }

  async function signIn() {
    const supabase = getSupabase();
    if (!supabase || !email.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/` },
    });
    setMessage(error ? error.message : "Check your email for a sign-in link.");
  }

  async function signOut() {
    await getSupabase()?.auth.signOut();
    setUser(null);
    setMessage("Signed out. Your data stays on this device until you erase it.");
  }

  return (
    <section>
      <SectionHeading title="Account" hint="Sync across your phone, tablet and laptop." />
      <Panel className="space-y-3">
        {user ? (
          <>
            <p className="text-sm text-ink">Signed in as {user}</p>
            <div className="flex gap-2">
              <Button onClick={() => void store.syncNow()}>Sync now</Button>
              <Button onClick={() => void signOut()}>Sign out</Button>
            </div>
          </>
        ) : (
          <>
            <Field label="Email" hint="We send a one-time sign-in link — no password to forget.">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field text-sm"
                placeholder="you@example.com"
              />
            </Field>
            <Button variant="primary" onClick={() => void signIn()} disabled={!email.trim()}>
              Send sign-in link
            </Button>
          </>
        )}
        {message ? <p className="text-xs text-ink3">{message}</p> : null}
      </Panel>
    </section>
  );
}

function DataControls() {
  const store = useStore();
  const filename = portabilityFilename(store.userId);
  const preview = deletionPreview(
    [
      { store: "cards", count: store.cards.length },
      { store: "reviewLogs", count: store.reviewLogs.length },
      { store: "attempts", count: store.attempts.length },
      { store: "mistakes", count: store.mistakes.length },
      { store: "plannedSessions", count: store.plannedSessions.length },
      { store: "examDates", count: store.examDates.length },
      { store: "papers", count: store.papers.length },
      { store: "questions", count: store.questions.length },
    ],
    store.cards.filter((c) => c.origin === "manual" || c.origin === "mistake").length,
  );

  return (
    <section>
      <SectionHeading title="Data" hint="Portable, private, and yours to delete." />
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => exportDataPortable(store, filename)}>Export portable snapshot</Button>
          <Button onClick={() => exportDataLegacy(store)}>Export legacy JSON</Button>
          <Button
            onClick={async () => {
              const ok = confirm(`${preview.warning}\n\nErase every row on this device? This cannot be undone.`);
              if (!ok) return;
              await clearAll();
              location.reload();
            }}
          >
            Erase local data
          </Button>
        </div>
        <p className="text-[11px] text-ink3">Portable snapshot: {filename} — single-file, machine-readable, GDPR Art. 20 portable.</p>
        <p className="text-[11px] text-ink3">{preview.warning}</p>
        <p className="text-[11px] text-ink3">
          {isSupabaseConfigured
            ? "Erasing local data does not delete rows already synced to your account — use your account provider to delete server data."
            : "Sync is not configured, so this device holds the only copy — export before erasing."}
        </p>
      </Panel>
    </section>
  );
}

function exportDataPortable(store: ReturnType<typeof useStore>, filename: string) {
  const snap = buildPortabilitySnapshot({
    userId: store.userId,
    displayName: store.settings.displayName,
    cards: store.cards,
    attempts: store.attempts,
    reviewLogs: store.reviewLogs,
    mistakes: store.mistakes,
    plannedSessions: store.plannedSessions,
    examDates: store.examDates,
    settings: store.settings,
    streak: store.streak,
  });
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportDataLegacy(store: ReturnType<typeof useStore>) {
  const payload = {
    exportedAt: new Date().toISOString(),
    settings: store.settings,
    streak: store.streak,
    cards: store.cards,
    reviewLogs: store.reviewLogs,
    questions: store.questions,
    attempts: store.attempts,
    mistakes: store.mistakes,
    papers: store.papers,
    plannedSessions: store.plannedSessions,
    examDates: store.examDates,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `revise-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
