import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "blog-images";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// Uploads an image to Supabase Storage (bucket "blog-images") via the Storage
// REST API and returns its public URL. Requires SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY; otherwise the editor falls back to pasting a URL.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supaUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supaUrl || !supaKey) {
    return NextResponse.json(
      {
        error:
          "Supabase Storage nie je nakonfigurované (chýba SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Zatiaľ vlož obrázok ako URL.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Nepodporovaný formát obrázka." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Obrázok je príliš veľký (max 5 MB)." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const upload = await fetch(`${supaUrl}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      // The "apikey" header is required by the Supabase gateway — without it the
      // newer sb_secret_* keys are treated as a JWT and fail ("Invalid Compact JWS").
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      "Content-Type": file.type,
      "x-upsert": "true",
      "cache-control": "public, max-age=31536000",
    },
    body: bytes,
  });

  if (!upload.ok) {
    const detail = await upload.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Upload zlyhal (${upload.status}). Skontroluj, že bucket "${BUCKET}" existuje a je verejný. ${detail.slice(0, 160)}`,
      },
      { status: 502 },
    );
  }

  const url = `${supaUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
  return NextResponse.json({ url });
}
