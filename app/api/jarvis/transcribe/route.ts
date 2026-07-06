import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Transcribe a voice clip via OpenAI Whisper (Slovak).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY nie je nastavený." }, { status: 503 });

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return NextResponse.json({ error: "missing_audio" }, { status: 400 });

  // Respect the recorded container (Safari records audio/mp4, Chrome audio/webm).
  const filename = audio instanceof File && audio.name ? audio.name : "audio.webm";
  const out = new FormData();
  out.append("file", audio, filename);
  out.append("model", "whisper-1");
  out.append("language", "sk");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: out,
      signal: AbortSignal.timeout(45000),
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || `Whisper HTTP ${res.status}` }, { status: 500 });
    }
    return NextResponse.json({ transcript: (data.text ?? "").trim() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
