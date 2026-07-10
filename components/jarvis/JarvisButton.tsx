"use client";

import { Mic, Loader2, Volume2, AlertTriangle } from "lucide-react";
import { useJarvis } from "./useJarvis";

export function JarvisButton() {
  const { state, transcript, response, errorMsg, toggle } = useJarvis();
  const showBubbles = transcript || response || errorMsg;

  return (
    // On mobile the BottomNav (h-16 + safe area) owns the bottom edge, so lift the
    // button above it — otherwise it covers the "Viac" tab. Desktop keeps bottom-6.
    <div className="fixed right-6 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-end gap-2 lg:bottom-6">
      {showBubbles && (
        <div className="flex max-w-[320px] flex-col items-end gap-2">
          {transcript && (
            <div className="rounded-2xl rounded-br-sm bg-neutral-800 px-3.5 py-2 text-sm text-white shadow-lg">
              {transcript}
            </div>
          )}
          {response && (
            <div className="rounded-2xl rounded-br-sm border border-[#4A90D9]/60 bg-neutral-900 px-3.5 py-2 text-sm text-white shadow-lg">
              {response}
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-1.5 rounded-2xl rounded-br-sm border border-red-500/50 bg-neutral-900 px-3.5 py-2 text-sm text-red-300 shadow-lg">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {errorMsg}
            </div>
          )}
        </div>
      )}

      <button
        onClick={toggle}
        aria-label="Jarvis hlasový asistent"
        title="Jarvis (Cmd/Ctrl+Shift+J)"
        className={[
          "relative flex h-16 w-16 items-center justify-center rounded-full border transition-transform hover:scale-105 focus:outline-none cursor-pointer",
          "border-[#333] bg-[#0a0a0a] shadow-xl",
          state === "listening" ? "ring-2 ring-red-500/60" : "",
          state === "thinking" ? "ring-2 ring-[#4A90D9]/60" : "",
          state === "speaking" ? "ring-2 ring-green-500/60" : "",
        ].join(" ")}
      >
        {state === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/25" />}
        {state === "speaking" && <span className="absolute inset-0 animate-pulse rounded-full bg-green-500/20" />}
        {state === "idle" && <span className="absolute inset-0 animate-pulse rounded-full bg-[#4A90D9]/10" />}

        <span className="relative">
          {state === "thinking" ? (
            <Loader2 className="h-6 w-6 animate-spin text-[#4A90D9]" />
          ) : state === "speaking" ? (
            <Volume2 className="h-6 w-6 text-green-400" />
          ) : state === "error" ? (
            <AlertTriangle className="h-6 w-6 text-red-400" />
          ) : (
            <Mic className={state === "listening" ? "h-6 w-6 text-red-400" : "h-6 w-6 text-[#4A90D9]"} />
          )}
        </span>
      </button>
    </div>
  );
}
