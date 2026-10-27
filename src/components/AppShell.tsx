"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useStoreFields } from "@/state/store";
import { cx } from "./ui";
import {
  ICON_SIZE,
  LessonsIcon,
  LibraryIcon,
  ModesIcon,
  MoreIcon,
  OfflineIcon,
  PapersIcon,
  PlanIcon,
  PracticalIcon,
  PracticeIcon,
  ProgressIcon,
  ReviewIcon,
  SearchIcon,
  SettingsIcon,
  SyncIcon,
  TeacherIcon,
  TechniqueIcon,
  TodayIcon,
  TutorIcon,
  WarningIcon,
} from "./icons";
import type { LucideIcon } from "./icons";
import { preloadWhenIdle } from "./preloadWhenIdle";
import { PilotOutcomesSync } from "./PilotOutcomesSync";
import { useShortcuts } from "./shortcuts";
import { Onboarding } from "./Onboarding";

// Search is a modal opened on demand: keep it (and Base UI) out of the shell
// bundle, then fetch it once the page is idle so it still opens offline.
const loadSearchOverlay = () => import("./SearchOverlay").then((m) => m.SearchOverlay);
const SearchOverlay = dynamic(loadSearchOverlay, { ssr: false });

// Five destinations, one per thing a student does, plus Settings:
//   Today     what should I do?              (and the session it starts)
//   Learn     learn content                  (lessons, tutor, manual study modes)
//   Practice  answer questions and prove it  (practice, review, past papers, quick check)
//   Progress  trajectory, readiness, improvement (schedule, revision twin)
//   Library   find content directly
// Manual study modes and specialist surfaces keep their routes (no deep link
// breaks) but sit in a collapsed "Tools" menu, so the adaptive Today loop is
// the primary journey and nothing in the rail competes with it. `match` lists the
// routes a destination owns, so the right tab stays highlighted inside them.
// Today stays first: the product's claim is that it knows what to do next,
// and Readiness/Progress plus the subject library remain one tap away.

type NavItem = { href: string; label: string; Icon: LucideIcon; primary?: boolean; match?: readonly string[] };

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Today", Icon: TodayIcon, primary: true, match: ["/adaptive-session"] },
  { href: "/lesson", label: "Learn", Icon: LessonsIcon, primary: true, match: ["/study", "/tutor"] },
  { href: "/practice", label: "Practice", Icon: PracticeIcon, primary: true, match: ["/review", "/papers", "/diagnostic"] },
  { href: "/readiness", label: "Progress", Icon: ProgressIcon, primary: true, match: ["/schedule", "/twin"] },
  { href: "/library", label: "Library", Icon: LibraryIcon, primary: true, match: ["/shared"] },
];
// Tools: manual modes, one tap away, collapsed by default, never competing with the loop.
const TOOLS_NAV: NavItem[] = [
  { href: "/review", label: "Review", Icon: ReviewIcon },
  { href: "/papers", label: "Past papers", Icon: PapersIcon },
  { href: "/study", label: "Choose how to study", Icon: ModesIcon },
  { href: "/tutor", label: "Tutor", Icon: TutorIcon },
  { href: "/schedule", label: "Schedule", Icon: PlanIcon },
  { href: "/technique", label: "Exam-technique drills", Icon: TechniqueIcon },
  { href: "/practicals", label: "Practical skills", Icon: PracticalIcon },
  { href: "/classes", label: "Your classes", Icon: TeacherIcon },
];

// Status-bar colours: the top bar's --surface in each theme (src/app/le-studio.css).
const THEME_COLOR = { light: "#ffffff", dark: "#17171a" } as const;

const SETTINGS_NAV: NavItem[] = [{ href: "/settings", label: "Settings", Icon: SettingsIcon }];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { settings, dueCards, syncStatus, syncNow, updateSettings, needsOnboarding, completeOnboarding } = useStoreFields("settings", "dueCards", "syncStatus", "syncNow", "updateSettings", "needsOnboarding", "completeOnboarding");
  const [searchOpen, setSearchOpen] = useState(false);
  // The Tools sheet is transient: it is open only on the route it was opened
  // from, so any navigation (including browser back) closes it, and Escape
  // closes it too. It never lingers over the next screen.
  const [toolsOpenOn, setToolsOpenOn] = useState<string | null>(null);
  const toolsOpen = toolsOpenOn === pathname;
  const toolsRef = useRef<HTMLDetailsElement>(null);
  const setToolsOpen = (open: boolean) => setToolsOpenOn(open ? pathname : null);
  // Close through the element as well as state: a tap before hydration opens
  // the <details> natively while React still holds "closed", and setting an
  // unchanged state would not re-render to close it.
  const closeTools = () => {
    toolsRef.current?.removeAttribute("open");
    setToolsOpenOn(null);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !toolsRef.current?.open) return;
      toolsRef.current.removeAttribute("open");
      setToolsOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const syncNotice = !syncStatus.online
    ? {
        title: "Offline — your work is safe",
        body: syncStatus.pending
          ? `${syncStatus.pending} change${syncStatus.pending === 1 ? "" : "s"} will sync when you reconnect.`
          : "Your revision work is saved on this device and will sync when you reconnect.",
      }
    : syncStatus.syncing
      ? { title: "Syncing your latest changes…", body: "You can keep revising while this finishes." }
      : syncStatus.failed > 0
        ? {
            title: `${syncStatus.failed} change${syncStatus.failed === 1 ? "" : "s"} could not be synced`,
            body: "Automatic retries stopped for these changes. Review them in Settings before retrying or discarding anything.",
          }
        : syncStatus.lastSyncError
          ? { title: "Sync needs another attempt", body: syncStatus.lastSyncError }
          : syncStatus.pending
          ? {
              title: `${syncStatus.pending} change${syncStatus.pending === 1 ? "" : "s"} waiting to sync`,
              body: "Your work is saved here. We’ll retry automatically, or you can try now.",
            }
          : null;
  const SyncNoticeIcon = !syncStatus.online ? OfflineIcon : syncStatus.failed > 0 || syncStatus.lastSyncError ? WarningIcon : SyncIcon;
  const syncNoticeClass = !syncStatus.online
    ? "bg-reviewsoft text-review"
    : syncStatus.failed > 0 || syncStatus.lastSyncError
      ? "bg-dangersoft text-danger"
      : "bg-surface2 text-ink2";

  useEffect(() => preloadWhenIdle(loadSearchOverlay), []);

  // Theme and accessibility preferences live on <html> so Le Studio's tokens
  // flip everything at once, including anything rendered into a portal.
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && prefersDark.matches);
      root.classList.toggle("dark", dark);
      root.dataset.theme = dark ? "dark" : "light";
      // The browser/PWA status bar follows the in-app theme, not only the OS
      // one, and matches the top bar's surface so the two read as one piece.
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
        meta.content = dark ? THEME_COLOR.dark : THEME_COLOR.light;
      });
    };
    apply();
    prefersDark.addEventListener("change", apply);
    return () => prefersDark.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("large-text", settings.accessibility.largeText);
    root.classList.toggle("dyslexia", settings.accessibility.dyslexiaFont);
    root.classList.toggle("high-contrast", settings.accessibility.highContrast);
    root.classList.toggle("reduce-motion", settings.accessibility.reduceMotion);
  }, [settings.accessibility]);

  const toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    const next = dark ? "light" : "dark";
    void updateSettings({ theme: next });
    try {
      localStorage.setItem("revise.theme", next);
    } catch {
      /* private browsing keeps the in-app preference only */
    }
  };

  // Navigation shortcuts are global, so they are registered by the shell
  // rather than by each page — and they show up in the `?` sheet everywhere.
  useShortcuts(
    [
      { key: "k", meta: true, group: "Global", label: "Search", allowInInput: true, run: () => setSearchOpen(true) },
      { key: "g", group: "Go to", label: "Today", run: () => router.push("/") },
      { key: "r", group: "Go to", label: "Review", run: () => router.push("/review") },
      { key: "p", group: "Go to", label: "Practice", run: () => router.push("/practice") },
      { key: "m", group: "Go to", label: "Choose how to study", run: () => router.push("/study") },
      { key: "h", group: "Go to", label: "Lessons", run: () => router.push("/lesson") },
      { key: "a", group: "Go to", label: "Past papers", run: () => router.push("/papers") },
      { key: "o", group: "Go to", label: "Progress", run: () => router.push("/readiness") },
      { key: "l", group: "Go to", label: "Library", run: () => router.push("/library") },
      { key: "d", group: "Global", label: "Toggle dark mode", run: toggleTheme },
    ],
    [router, settings.theme],
  );

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // A destination is highlighted inside the routes it owns; aria-current stays on the exact page only.
  const inSection = (item: NavItem) => isActive(item.href) || (item.match ?? []).some((route) => pathname.startsWith(route));
  const toolsActive = TOOLS_NAV.some((item) => isActive(item.href));

  if (needsOnboarding) {
    // Teachers can open their roster without enrolling in student revision.
    if (pathname !== "/classes" && pathname !== "/settings") return <Onboarding onDone={completeOnboarding} />;
  }

  return (
    <div className="min-h-dvh bg-bg">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* Desktop rail — landmark + label so screen readers name it, not just "navigation" */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-56 flex-col border-r border-line bg-surface z-20" aria-label="Primary">
        <div className="px-4 py-5">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- 22px static icon; next/image adds setup cost with no benefit here */}
            <img src="/logo.svg" alt="" width={22} height={22} aria-hidden="true" />
            <p className="text-sm font-semibold tracking-tight">Revise</p>
          </div>
          <p className="text-[11px] text-ink3 mt-0.5">{settings.displayName}</p>
        </div>
        <nav className="flex-1 px-2" aria-label="Main">
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => (
              <RailLink key={item.href} item={item} active={inSection(item)} current={isActive(item.href)} due={dueCards.length} />
            ))}
          </div>
          {/* Collapsed unless the current page is one of the tools, so it never competes with Today. */}
          <details className="mt-4 group/tools" open={toolsActive || undefined}>
            <summary className="list-none cursor-pointer select-none flex items-center gap-2 px-2.5 py-1.5 min-h-9 rounded-lg text-[10px] font-semibold uppercase tracking-[0.12em] text-ink3 hover:bg-surface2">
              <span className="flex-1">Tools</span>
              <svg viewBox="0 0 12 12" aria-hidden="true" className="w-3 h-3 transition-transform group-open/tools:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4.5l3 3 3-3" />
              </svg>
            </summary>
            <div className="space-y-0.5 mt-0.5">
              {TOOLS_NAV.map((item) => (
                <RailLink key={item.href} item={item} active={isActive(item.href)} current={isActive(item.href)} due={dueCards.length} />
              ))}
            </div>
          </details>
          <div className="mt-4 space-y-0.5">
            {SETTINGS_NAV.map((item) => (
              <RailLink key={item.href} item={item} active={isActive(item.href)} current={isActive(item.href)} due={dueCards.length} />
            ))}
          </div>
        </nav>
        <div className="p-3 space-y-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full field text-left text-xs text-ink3 flex items-center gap-2"
          >
            <SearchIcon size={ICON_SIZE.sm} aria-hidden />
            <span className="flex-1">Search</span>
            <kbd className="text-[10px]">⌘K</kbd>
          </button>
          <StatusStrip />
        </div>
      </aside>

      {/* Mobile top bar — banner landmark for SR rotor */}
      <header className="lg:hidden sticky top-0 z-20 bg-surface border-b border-line" role="banner">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- 22px static icon; next/image adds setup cost with no benefit here */}
            <img src="/logo.svg" alt="" width={22} height={22} aria-hidden="true" />
            <p className="text-base font-semibold tracking-tight">Revise</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSearchOpen(true)} className="btn btn-ghost" aria-label="Search">
              <SearchIcon size={ICON_SIZE.lg} aria-hidden />
            </button>
            <Link href="/settings" className="btn btn-ghost" aria-label="Settings">
              <SettingsIcon size={ICON_SIZE.lg} aria-hidden />
            </Link>
          </div>
        </div>
        {syncStatus.enabled && syncNotice ? (
          <div className={cx("px-4 py-2.5 text-[11px] font-medium flex items-start gap-2", syncNoticeClass)} role="status" aria-live="polite">
            <SyncNoticeIcon size={ICON_SIZE.sm} aria-hidden className={cx("shrink-0 mt-0.5", syncStatus.syncing && "animate-spin")} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{syncNotice.title}</p>
              <p className="mt-0.5 leading-relaxed">{syncNotice.body}</p>
            </div>
            {syncStatus.online && !syncStatus.syncing ? (
              syncStatus.failed > 0 ? (
                <Link href="/settings#sync-recovery" className="shrink-0 underline underline-offset-2">
                  Review
                </Link>
              ) : (
                <button type="button" onClick={() => void syncNow()} className="shrink-0 underline underline-offset-2">
                  {syncStatus.lastSyncError ? "Try again" : "Sync now"}
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </header>

      <main id="main" className="lg:pl-56 pb-24 lg:pb-10">
        <div className={cx("mx-auto w-full px-4 sm:px-6 py-5 sm:py-7 app-enter", pathname === "/" ? "max-w-6xl" : "max-w-5xl")}>{children}</div>
      </main>

      {/* Mobile bottom bar — duplicate navigation for thumb reach; a distinct
          label keeps the two landmarks unambiguous for screen readers */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-line elev-nav pb-safe"
        aria-label="Primary sections (mobile)"
      >
        <div className="grid grid-cols-6">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cx(
                "flex flex-col items-center justify-center gap-0.5 py-2 min-h-12 text-[10px] font-medium transition-colors relative",
                inSection(item) ? "text-ink" : "text-ink3",
              )}
            >
              <item.Icon size={ICON_SIZE.lg} aria-hidden />
              {item.label}
              {item.href === "/practice" && dueCards.length > 0 ? (
                <span className="absolute top-1 right-[22%] w-1.5 h-1.5 rounded-full bg-review" aria-hidden="true" />
              ) : null}
            </Link>
          ))}
          {/* Tools is a short interruption over the current screen, so it is a
              bottom sheet with a scrim: a tap outside, Escape, or picking a
              destination dismisses it. (It used to be an unanchored popover
              that stayed open over the page until its own button was tapped
              again.) Still a <details>, so it works before hydration. */}
          <details
            ref={toolsRef}
            className={cx("group", toolsOpen && "text-ink")}
            open={toolsOpen}
            onToggle={(event) => setToolsOpen(event.currentTarget.open)}
          >
            <summary
              className={cx(
                "list-none cursor-pointer flex flex-col items-center justify-center gap-0.5 py-2 min-h-12 text-[10px] font-medium transition-colors",
                toolsOpen || toolsActive ? "text-ink" : "text-ink3",
              )}
            >
              <MoreIcon size={ICON_SIZE.lg} aria-hidden />
              Tools
            </summary>
            <div className="fixed inset-0 z-30 bg-black/40 scrim-enter" aria-hidden="true" onClick={closeTools} />
            <div
              role="dialog"
              aria-label="Tools"
              className="fixed inset-x-0 bottom-0 z-40 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface elev-sheet px-2 pt-2 pb-safe sheet-enter"
            >
              <span className="mx-auto mb-1 block h-1 w-9 rounded-full bg-line" aria-hidden="true" />
              <p className="px-3 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink3">Tools</p>
              {[...TOOLS_NAV, ...SETTINGS_NAV].map((item) => (
                <Link key={item.href} href={item.href} onClick={closeTools}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 px-3 py-3 min-h-12 rounded-lg text-[15px] transition-colors hover:bg-surface2 active:bg-surface2",
                    isActive(item.href) ? "font-semibold text-ink" : "text-ink",
                  )}>
                  <item.Icon size={ICON_SIZE.lg} aria-hidden className="shrink-0 text-ink2" />{item.label}
                  {item.href === "/review" && dueCards.length > 0 ? <span className="ml-auto text-xs font-semibold tabular-nums text-review">{dueCards.length}</span> : null}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </nav>

      {searchOpen ? <SearchOverlay onClose={() => setSearchOpen(false)} /> : null}
      <PilotOutcomesSync />
    </div>
  );
}

function RailLink({ item, active, current, due }: { item: NavItem; active: boolean; current: boolean; due: number }) {
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cx(
        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors",
        active ? "bg-surface2 text-ink font-semibold" : "text-ink2 hover:bg-surface2",
      )}
    >
      <item.Icon size={ICON_SIZE.md} aria-hidden className="shrink-0" />
      <span className="flex-1">{item.label}</span>
      {(item.href === "/review" || item.href === "/practice") && due > 0 ? (
        <span className="text-[11px] font-semibold tabular-nums text-review">{due}</span>
      ) : null}
    </Link>
  );
}

function StatusStrip() {
  const { syncStatus, syncNow } = useStoreFields("syncStatus", "syncNow");
  const lastSynced = syncStatus.lastSyncedAt
    ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="text-[11px] text-ink3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cx("w-1.5 h-1.5 rounded-full", syncStatus.online ? "bg-success" : "bg-review")}
          />
          {syncStatus.enabled
            ? syncStatus.syncing
              ? "Syncing…"
              : syncStatus.failed > 0
                ? `${syncStatus.failed} need${syncStatus.failed === 1 ? "s" : ""} attention`
                : syncStatus.online
                  ? syncStatus.pending
                    ? `${syncStatus.pending} queued`
                    : "Synced"
                  : "Offline — saved here"
            : "Local only — saved here"}
        </span>
        {syncStatus.enabled ? (
          syncStatus.failed > 0 ? (
            <Link href="/settings#sync-recovery" className="underline hover:text-ink">
              Review
            </Link>
          ) : (
            <button type="button" onClick={() => void syncNow()} className="underline hover:text-ink">
              {syncStatus.syncing
                ? "Syncing…"
                : syncStatus.lastSyncError
                  ? "Try again"
                  : syncStatus.pending
                    ? `${syncStatus.pending} queued`
                    : "Sync now"}
            </button>
          )
        ) : null}
      </div>
      {syncStatus.lastSyncError ? <p className="text-danger" role="status">{syncStatus.lastSyncError}</p> : null}
      {lastSynced && syncStatus.online && !syncStatus.lastSyncError ? <p>Last synced {lastSynced}</p> : null}
    </div>
  );
}
