"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type JarvisState = "idle" | "listening" | "thinking" | "speaking" | "error";

const RECORD_MS = 5000; // fixed recording window — always stop + send after this
const BUBBLE_HIDE_MS = 8000;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

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
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

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

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setTranscript("");
      setResponse("");
      setErrorMsg("");
    }, BUBBLE_HIDE_MS);
  }, []);

  const cleanupRecording = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const fail = useCallback(
    (msg: string) => {
      cleanupRecording();
      setErrorMsg(msg);
      setState("error");
      scheduleHide();
      setTimeout(() => setState((s) => (s === "error" ? "idle" : s)), 1500);
    },
    [cleanupRecording, scheduleHide],
  );

  const runPipeline = useCallback(
    async (blob: Blob, ext: string) => {
      setState("thinking");
      try {
        const fd = new FormData();
        fd.append("audio", blob, `audio.${ext}`);
        console.log("[Jarvis] Sending to Whisper...");
        const tRes = await fetch("/api/jarvis/transcribe", { method: "POST", body: fd });
        const tJson = await tRes.json();
        if (!tRes.ok) return fail(tJson.error || "Prepis zlyhal");
        const text = (tJson.transcript ?? "").trim();
        console.log("[Jarvis] Transcript:", text);
        if (!text) return fail("Nič som nepočul, skús znova.");
        setTranscript(text);
        setResponse("");
        scheduleHide();

        const thRes = await fetch("/api/jarvis/think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const thJson = await thRes.json();
        if (!thRes.ok) return fail(thJson.error || "Rozmýšľanie zlyhalo");
        const answer = (thJson.response ?? "").trim();
        console.log("[Jarvis] Jarvis response:", answer);
        setResponse(answer);
        scheduleHide();

        console.log("[Jarvis] Speaking...");
        const spRes = await fetch("/api/jarvis/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: answer }),
        });
        if (!spRes.ok) {
          const j = await spRes.json().catch(() => ({}));
          return fail(j.error || "Hlas zlyhal");
        }
        const arrayBuf = await spRes.arrayBuffer();
        const ctx = audioCtxRef.current ?? new AudioContext();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        const src = ctx.createBufferSource();
        sourceNodeRef.current = src;
        src.buffer = audioBuf;
        src.connect(ctx.destination);
        src.onended = () => {
          sourceNodeRef.current = null;
          setState((s) => (s === "speaking" ? "idle" : s));
        };
        setState("speaking");
        src.start();
      } catch (e) {
        fail((e as Error).message || "Niečo zlyhalo");
      }
    },
    [fail, scheduleHide],
  );

  const stopListening = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
  }, []);

  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return fail("Mikrofón nie je dostupný v tomto prehliadači.");
    }
    setTranscript("");
    setResponse("");
    setErrorMsg("");
    // Release the mic from wake-word recognition before recording.
    suppressRestartRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
    }
    recognizingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      mimeRef.current = mime;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanupRecording();
        const type = mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        console.log("[Jarvis] Recording stopped, blob size:", blob.size);
        if (blob.size < 800) {
          fail("Nahrávka je príliš krátka.");
          return;
        }
        runPipeline(blob, extFor(type));
      };

      recorder.start();
      setState("listening");
      console.log("[Jarvis] Recording started");
      // Fixed 5s window — always stop and send (reliable across browsers).
      // Manual second click on the orb (toggle → stopListening) stops earlier.
      maxTimerRef.current = setTimeout(() => stopListening(), RECORD_MS);
    } catch (e) {
      const err = e as Error;
      fail(err.name === "NotAllowedError" ? "Prístup k mikrofónu bol zamietnutý." : err.message || "Nahrávanie zlyhalo.");
    }
  }, [cleanupRecording, fail, runPipeline, stopListening]);

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s === "listening") stopListening();
    else if (s === "speaking") {
      sourceNodeRef.current?.stop();
      sourceNodeRef.current = null;
      setState("idle");
    } else if (s === "idle" || s === "error") {
      startListening();
    }
  }, [startListening, stopListening]);

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

  useEffect(() => {
    return () => {
      cleanupRecording();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      sourceNodeRef.current?.stop();
      audioCtxRef.current?.close().catch(() => {});
      wakeActiveRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, [cleanupRecording]);

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
