"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Panel, Pill, SectionHeading } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaInstallContextValue {
  installed: boolean;
  canPrompt: boolean;
  ios: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function standaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function iosNow(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Captures Chromium's one-shot install event at app startup so Settings can
 * still offer installation even when the browser fired the event before the
 * student navigated there.
 */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(standaloneNow());
    setIos(iosNow());

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const refreshInstalled = () => setInstalled(standaloneNow());
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    displayMode.addEventListener?.("change", refreshInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
      displayMode.removeEventListener?.("change", refreshInstalled);
    };
  }, []);

  const value = useMemo<PwaInstallContextValue>(
    () => ({
      installed,
      canPrompt: Boolean(installEvent) && !installed,
      ios,
      promptInstall: async () => {
        if (!installEvent || installed) return "unavailable";
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        setInstallEvent(null);
        return choice.outcome;
      },
    }),
    [installEvent, installed, ios],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

function usePwaInstall(): PwaInstallContextValue {
  const value = useContext(PwaInstallContext);
  if (!value) {
    return {
      installed: false,
      canPrompt: false,
      ios: false,
      promptInstall: async () => "unavailable",
    };
  }
  return value;
}

export function PwaInstallSettings() {
  const { installed, canPrompt, ios, promptInstall } = usePwaInstall();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section>
      <SectionHeading title="Install Revise" hint="Launch it like an app and keep the offline shell one tap away." />
      <Panel>
        {installed ? (
          <div className="space-y-2">
            <Pill tone="success">Installed</Pill>
            <p className="text-sm text-ink2">
              Revise is running as an installed app. Your revision data remains IndexedDB-first and works offline.
            </p>
          </div>
        ) : canPrompt ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink">Install Revise on this device</p>
              <p className="text-[11px] text-ink3 mt-0.5">
                Adds a home-screen or desktop app icon and launches Revise without normal browser chrome.
              </p>
            </div>
            <Button
              variant="primary"
              className="shrink-0"
              onClick={() =>
                void promptInstall().then((outcome) => {
                  if (outcome === "dismissed") setMessage("Install dismissed — you can try again when your browser offers it.");
                  else if (outcome === "accepted") setMessage("Install accepted.");
                  else setMessage("Your browser is not offering installation right now.");
                })
              }
            >
              Install app
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-ink">Add Revise to your device</p>
            <p className="text-[11px] text-ink3">
              {ios
                ? "On iPhone or iPad, open Revise in Safari, tap Share, then choose Add to Home Screen."
                : "If your browser supports web-app installation, use its menu and choose Install app or Add to Home screen. Visit Revise once online first so the offline shell can be saved."}
            </p>
          </div>
        )}
        {message ? <p className="text-[11px] text-ink3 mt-3" role="status">{message}</p> : null}
      </Panel>
    </section>
  );
}
