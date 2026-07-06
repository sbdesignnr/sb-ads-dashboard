"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type JarvisState = "idle" | "listening" | "thinking" | "speaking" | "error";

const SILENCE_MS = 2500; // auto-stop after this much silence
const MIN_RECORD_MS = 700; // ignore silence in the very first moment
const MAX_RECORD_MS = 15000; // hard cap
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

export interface UseJarvis {
  state: JarvisState;
  transcript: string;
  response: string;
  errorMsg: string;
  toggle: () => void;
  startListening: () => void;
  stopListening: () => void;
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
  const startedAtRef = useRef<number>(0);
  const lastSoundRef = useRef<number>(0);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

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
        const tRes = await fetch("/api/jarvis/transcribe", { method: "POST", body: fd });
        const tJson = await tRes.json();
        if (!tRes.ok) return fail(tJson.error || "Prepis zlyhal");
        const text = (tJson.transcript ?? "").trim();
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
        setResponse(answer);
        scheduleHide();

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
        if (blob.size < 800) {
          fail("Nahrávka je príliš krátka.");
          return;
        }
        runPipeline(blob, extFor(type));
      };

      recorder.start();
      startedAtRef.current = Date.now();
      lastSoundRef.current = Date.now();
      setState("listening");

      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const sourceNode = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      sourceNode.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.fftSize);

      const tick = () => {
        const an = analyserRef.current;
        if (!an || stateRef.current !== "listening") return;
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (rms > 0.025) lastSoundRef.current = now;
        const elapsed = now - startedAtRef.current;
        if (elapsed > MIN_RECORD_MS && now - lastSoundRef.current > SILENCE_MS) {
          stopListening();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      maxTimerRef.current = setTimeout(() => stopListening(), MAX_RECORD_MS);
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
    };
  }, [cleanupRecording]);

  return { state, transcript, response, errorMsg, toggle, startListening, stopListening };
}
