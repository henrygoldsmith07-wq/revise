"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { speak, speechAvailable, stopSpeaking } from "@/lib/speech";
import { Button } from "./ui";
import { AudioIcon, AudioOffIcon, ICON_SIZE } from "./icons";

// Read a card aloud. Uses a recorded clip when the card carries one, and the
// browser's own voice otherwise — no network, so it works on the bus.

const NO_SUBSCRIBE = () => () => {};
const available = () => speechAvailable();
const unavailableOnServer = () => false;

export function SpeakButton({ text, audioUrl, label }: { text: string; audioUrl?: string; label?: string }) {
  const canSpeak = useSyncExternalStore(NO_SUBSCRIBE, available, unavailableOnServer);
  const [speaking, setSpeaking] = useState(false);

  // Anything still being spoken when the card changes must be silenced, or the
  // audio narrates the previous card over the new one.
  useEffect(() => () => stopSpeaking(), []);

  if (audioUrl) {
    return <audio controls preload="none" src={audioUrl} className="h-8 max-w-[12rem]" aria-label={label ?? "Card audio"} />;
  }
  if (!canSpeak) return null;

  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={label ?? "Read aloud"}
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        setSpeaking(true);
        speak(text, { onEnd: () => setSpeaking(false) });
      }}
    >
      {speaking ? <AudioOffIcon size={ICON_SIZE.sm} aria-hidden /> : <AudioIcon size={ICON_SIZE.sm} aria-hidden />}
    </Button>
  );
}
