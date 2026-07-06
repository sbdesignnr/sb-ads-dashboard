"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type JarvisState = "idle" | "listening" | "thinking" | "speaking" | "error";

const RECORD_MS = 5000; // fixed recording window — always stop + send after this
const BUBBLE_HIDE_MS = 8000;

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Minimal SpeechRecognition typings (not in the standard TS DOM lib).
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly length: number;
  readonly [index: number]: SRAlternative;
}
interface SRResultList {
  readonly length: number;
  readonly [index: number]: SRResult;
}
interface SRResultEvent {
  results: SRResultList;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SRResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseJarvis {
  state: JarvisState;
  transcript: string;
  response: string;
  errorMsg: string;
  toggle: () => void;
  startListening: () => void;
  stopListening: () => void;
  // Wake-word ("jarvis") continuous listening — opt-in (only the command center uses it).
  wakeWordActive: boolean;
  wakeWordSupported: boolean;
  startWakeWordListening: () => void;
  stopWakeWordListening: () => void;
}

/** The transcribe → think → speak voice pipeline, shared by the button + command center. */
export function useJarvis(options: { shortcut?: boolean } = {}): UseJarvis {
  const { shortcut = true } = options;
  const [state, setState] = useState<JarvisState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wake-word state.
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [wakeWordSupported, setWakeWordSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeActiveRef = useRef(false);
  const recognizingRef = useRef(false);
  const suppressRestartRef = useRef(false);
  const startListeningRef = useRef<(() => void) | null>(null);

  const stateRef = useRef<JarvisState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setBoth = useCallback((s: JarvisState) => {
    setState(s);
    stateRef.current = s;
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setTranscript("");
      setResponse("");
      setErrorMsg("");
    }, BUBBLE_HIDE_MS);
  }, []);

  const showError = useCallback(
    (msg: string) => {
      console.error("[Jarvis] Error:", msg);
      setErrorMsg(msg);
      scheduleHide();
      setBoth("idle");
    },
    [scheduleHide, setBoth],
  );

  const startListening = useCallback(async () => {
    // Only start from a resting state.
    if (stateRef.current !== "idle" && stateRef.current !== "error") return;

    // Release the mic from wake-word recognition before recording.
    suppressRestartRef.current = true;
    recognizingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
    }

    setTranscript("");
    setResponse("");
    setErrorMsg("");
    setBoth("listening");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        console.log("[Jarvis] Recording stopped, blob size:", blob.size);

        if (blob.size < 1000) {
          console.log("[Jarvis] Audio too small, ignoring");
          setBoth("idle");
          return;
        }

        setBoth("thinking");
        try {
          console.log("[Jarvis] Sending to Whisper...");
          const formData = new FormData();
          formData.append("audio", blob, `audio.${extFor(type)}`);
          const transcribeRes = await fetch("/api/jarvis/transcribe", { method: "POST", body: formData });
          const transcribeJson = await transcribeRes.json();
          if (!transcribeRes.ok) return showError(transcribeJson.error || "Prepis zlyhal");
          const text = (transcribeJson.transcript ?? "").trim();
          console.log("[Jarvis] Transcript:", text);
          if (!text) {
            setBoth("idle");
            return;
          }
          setTranscript(text);
          scheduleHide();

          const thinkRes = await fetch("/api/jarvis/think", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
          });
          const thinkJson = await thinkRes.json();
          if (!thinkRes.ok) return showError(thinkJson.error || "Rozmýšľanie zlyhalo");
          const answer = (thinkJson.response ?? "").trim();
          console.log("[Jarvis] Response:", answer);
          setResponse(answer);
          scheduleHide();

          setBoth("speaking");
          console.log("[Jarvis] Speaking...");
          const speakRes = await fetch("/api/jarvis/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: answer }),
          });
          if (!speakRes.ok) {
            const j = await speakRes.json().catch(() => ({}));
            return showError(j.error || "Hlas zlyhal");
          }
          const audioBuffer = await speakRes.arrayBuffer();
          const ctx = audioCtxRef.current ?? new AudioContext();
          audioCtxRef.current = ctx;
          if (ctx.state === "suspended") await ctx.resume();
          const decoded = await ctx.decodeAudioData(audioBuffer);
          const source = ctx.createBufferSource();
          sourceNodeRef.current = source;
          source.buffer = decoded;
          source.connect(ctx.destination);
          source.onended = () => {
            sourceNodeRef.current = null;
            setBoth("idle");
            console.log("[Jarvis] Done");
          };
          source.start();
        } catch (err) {
          showError((err as Error).message || "Niečo zlyhalo");
        }
      };

      recorder.start();
      console.log("[Jarvis] Recording started");

      // Fixed 5s window — always stop and send. Manual second click stops earlier.
      setTimeout(() => {
        if (recorder.state === "recording") {
          console.log("[Jarvis] Timeout — stopping recorder");
          recorder.stop();
        }
      }, RECORD_MS);
    } catch (err) {
      const e = err as Error;
      showError(e.name === "NotAllowedError" ? "Prístup k mikrofónu bol zamietnutý." : e.message || "Nahrávanie zlyhalo.");
    }
  }, [scheduleHide, setBoth, showError]);

  const stopListening = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s === "listening") stopListening();
    else if (s === "speaking") {
      try {
        sourceNodeRef.current?.stop();
      } catch {
        /* ignore */
      }
      sourceNodeRef.current = null;
      setBoth("idle");
    } else if (s === "idle" || s === "error") {
      startListening();
    }
  }, [setBoth, startListening, stopListening]);

  // --- Wake word ("jarvis") via the browser SpeechRecognition API ---
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  useEffect(() => {
    setWakeWordSupported(!!getSpeechRecognitionCtor());
  }, []);

  const startRecognition = useCallback(() => {
    if (recognizingRef.current || !wakeActiveRef.current || stateRef.current !== "idle") return;
    let rec = recognitionRef.current;
    if (!rec) {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;
      rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "sk-SK";
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += (e.results[i][0]?.transcript ?? "") + " ";
        if (fold(text).includes("jarvi")) {
          // Wake word detected → hand off to the Whisper recording flow.
          suppressRestartRef.current = true;
          recognizingRef.current = false;
          try {
            rec!.abort();
          } catch {
            /* ignore */
          }
          startListeningRef.current?.();
        }
      };
      rec.onend = () => {
        recognizingRef.current = false;
        // Keep it alive across the API's periodic auto-stops while idle.
        if (wakeActiveRef.current && !suppressRestartRef.current && stateRef.current === "idle") {
          try {
            rec!.start();
            recognizingRef.current = true;
          } catch {
            /* already running */
          }
        }
      };
      rec.onerror = (e) => {
        recognizingRef.current = false;
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          wakeActiveRef.current = false;
          setWakeWordActive(false);
        }
      };
      recognitionRef.current = rec;
    }
    try {
      rec.start();
      recognizingRef.current = true;
    } catch {
      /* start() throws if already running */
    }
  }, []);

  const startWakeWordListening = useCallback(() => {
    if (!getSpeechRecognitionCtor()) return; // unsupported → no-op (fallback to click)
    wakeActiveRef.current = true;
    suppressRestartRef.current = false;
    setWakeWordActive(true);
    startRecognition();
  }, [startRecognition]);

  const stopWakeWordListening = useCallback(() => {
    wakeActiveRef.current = false;
    setWakeWordActive(false);
    recognizingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Resume wake-word listening once the pipeline returns to idle.
  useEffect(() => {
    if (state === "idle" && wakeActiveRef.current) {
      suppressRestartRef.current = false;
      const t = setTimeout(() => startRecognition(), 400);
      return () => clearTimeout(t);
    }
  }, [state, startRecognition]);

  // Keyboard shortcut: Cmd/Ctrl+Shift+J
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, toggle]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        sourceNodeRef.current?.stop();
      } catch {
        /* ignore */
      }
      audioCtxRef.current?.close().catch(() => {});
      wakeActiveRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return {
    state,
    transcript,
    response,
    errorMsg,
    toggle,
    startListening,
    stopListening,
    wakeWordActive,
    wakeWordSupported,
    startWakeWordListening,
    stopWakeWordListening,
  };
}
