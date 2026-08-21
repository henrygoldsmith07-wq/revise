"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { aiOcr } from "@/ai/client";
import { Button, cx } from "./ui";
import { DictateIcon, DictateStopIcon, ICON_SIZE, PhotoIcon } from "./icons";

// Three ways in, because exam answers are not all typed: keyboard, voice, and
// a photo of handwritten working. Voice and photo are progressive
// enhancements — if the browser lacks speech recognition or no vision model is
// configured, those controls explain themselves and the textarea still works.

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getRecognitionConstructor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
  );
}

function getRecognition(): SpeechRecognitionLike | null {
  const ctor = getRecognitionConstructor();
  return ctor ? new ctor() : null;
}

// Support is read through useSyncExternalStore so the server renders `false`
// and the client corrects it after hydration, with no setState-in-effect.
const NO_SUBSCRIBE = () => () => {};
const speechSupported = () => Boolean(getRecognitionConstructor());
const speechUnsupportedOnServer = () => false;

export function AnswerInput({
  value,
  onChange,
  placeholder,
  rows = 5,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
}) {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const speechAvailable = useSyncExternalStore(NO_SUBSCRIBE, speechSupported, speechUnsupportedOnServer);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Dictation results arrive asynchronously, long after the render that
  // started them, so the callback needs the latest value rather than the one
  // captured when recognition began.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const toggleVoice = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const engine = getRecognition();
    if (!engine) {
      setStatus("This browser has no speech recognition. Chrome and Edge do.");
      return;
    }
    engine.continuous = true;
    engine.interimResults = false;
    engine.lang = "en-GB";
    engine.onresult = (event) => {
      let addition = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) addition += result[0].transcript;
      }
      if (addition) onChange(`${valueRef.current}${valueRef.current ? " " : ""}${addition.trim()}`);
    };
    engine.onend = () => setListening(false);
    engine.onerror = () => {
      setListening(false);
      setStatus("Dictation stopped. Check the microphone permission.");
    };
    recognition.current = engine;
    engine.start();
    setListening(true);
    setStatus(null);
  };

  const onPhoto = async (file: File) => {
    setStatus("Reading your handwriting…");
    const base64 = await toBase64(file);
    const result = await aiOcr(base64, file.type || "image/jpeg", "handwriting");
    if (!result.data.text) {
      setStatus(result.note ?? "Could not transcribe that image — type your answer instead.");
      return;
    }
    onChange(value ? `${value}\n${result.data.text}` : result.data.text);
    setStatus(
      result.data.confidence < 0.6
        ? "Transcribed, but the handwriting was hard to read — check it before submitting."
        : "Transcribed. Check it reads as you wrote it.",
    );
  };

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Your answer
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder ?? "Write your answer as you would in the exam…"}
        className="field nice-scroll resize-y font-normal text-base leading-6"
        aria-label={id ? undefined : "Your answer"}
      />
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={toggleVoice}
          aria-pressed={listening}
          className={cx("min-h-10", listening && "text-danger")}
          title={speechAvailable ? "Dictate your answer" : "Speech recognition unavailable in this browser"}
        >
          {listening ? (
            <>
              <DictateStopIcon size={ICON_SIZE.sm} aria-hidden />
              Stop dictation
            </>
          ) : (
            <>
              <DictateIcon size={ICON_SIZE.sm} aria-hidden />
              Dictate
            </>
          )}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => fileInput.current?.click()} className="min-h-10">
          <PhotoIcon size={ICON_SIZE.sm} aria-hidden />
          Photo of working
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Upload photo of handwritten working"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPhoto(file);
            e.target.value = "";
          }}
        />
        {value.trim() ? (
          <span className="text-[11px] text-ink3 sm:ml-auto tabular-nums">
            {value.trim().split(/\s+/).length} words
          </span>
        ) : null}
      </div>
      {status ? (
        <p className="text-[11px] text-ink3 mt-1" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}

export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}
