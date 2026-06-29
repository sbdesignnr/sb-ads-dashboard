"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Copy,
  Check,
  Plus,
  Trash2,
  ImagePlus,
  X,
  Loader2,
  Radio,
  Database,
  PanelLeft,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ai/Markdown";
import { copyToClipboard } from "@/lib/export";
import { formatRelativeTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

export interface AIChatHandle {
  ask: (question: string) => void;
}

interface ChatListItem {
  id: string;
  title: string;
  updatedAt: string;
}
interface PendingImage {
  id: number;
  dataUrl: string;
  base64: string;
  mediaType: string;
  name: string;
}
interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  images?: { dataUrl: string }[];
  imageCount?: number;
}

const SUGGESTIONS = [
  "Ktorá kampaň má najhorší ROAS?",
  "Kde míňam rozpočet neefektívne?",
  "Navrhni long-tail kľúčové slová",
  "Ako zlepšiť CTR mojich reklám?",
];

const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGES = 5;
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const greeting = (): Message => ({
  id: 0,
  role: "assistant",
  content:
    "Ahoj! Som AI analytik SB Design (Claude). Pred každou odpoveďou automaticky načítam **reálne dáta tvojich Google Ads kampaní** — výkon, kľúčové slová, reklamy, geo a konverzie. Môžeš mi tiež nahrať screenshot. Spýtaj sa ma na čokoľvek.",
});

function fileToImage(file: File, id: number): Promise<PendingImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({ id, dataUrl, base64: dataUrl.split(",")[1] ?? "", mediaType: file.type, name: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const AIChat = forwardRef<AIChatHandle, { className?: string }>(function AIChat(
  { className },
  ref,
) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([greeting()]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextSource, setContextSource] = useState<"google-ads" | "mock" | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const idRef = useRef(1);
  const imgIdRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const chatIdRef = useRef<string | null>(currentChatId);
  chatIdRef.current = currentChatId;
  const sendRef = useRef<(t: string) => void>(() => {});

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/chats");
      if (res.ok) setChats((await res.json()).chats ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loadingContext]);

  const newChat = () => {
    setMessages([greeting()]);
    setCurrentChatId(null);
    chatIdRef.current = null;
    setPendingImages([]);
    setContextSource(null);
    setSidebarOpen(false);
  };

  const loadChat = async (id: string) => {
    setSidebarOpen(false);
    try {
      const res = await fetch(`/api/ai/chats/${id}`);
      if (!res.ok) return;
      const chat = (await res.json()).chat;
      const loaded: Message[] = (Array.isArray(chat.messages) ? chat.messages : []).map(
        (m: { role: "user" | "assistant"; content: string; imageCount?: number }) => ({
          id: idRef.current++,
          role: m.role,
          content: m.content,
          imageCount: m.imageCount ?? 0,
        }),
      );
      setMessages(loaded.length ? loaded : [greeting()]);
      setCurrentChatId(id);
      chatIdRef.current = id;
    } catch {
      /* ignore */
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/ai/chats/${id}`, { method: "DELETE" }).catch(() => {});
    setChats((c) => c.filter((x) => x.id !== id));
    if (chatIdRef.current === id) newChat();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
      toast.error(`Maximum ${MAX_IMAGES} obrázkov`);
      return;
    }
    const accepted: File[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!ALLOWED.includes(f.type)) {
        toast.error(`Nepodporovaný formát: ${f.name}`);
        continue;
      }
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name} je príliš veľký (max 5 MB)`);
        continue;
      }
      accepted.push(f);
    }
    if (!accepted.length) return;
    const imgs = await Promise.all(accepted.map((f) => fileToImage(f, imgIdRef.current++)));
    setPendingImages((p) => [...p, ...imgs]);
  };

  const send = (text: string) => {
    const value = text.trim();
    if ((!value && pendingImages.length === 0) || streaming) return;

    const imagesForApi = pendingImages.map((p) => ({ mediaType: p.mediaType, data: p.base64 }));
    const previews = pendingImages.map((p) => ({ dataUrl: p.dataUrl }));

    const prior = messagesRef.current
      .filter((m) => m.content.trim().length > 0 || (m.imageCount ?? 0) > 0)
      .map((m) => ({ role: m.role, content: m.content, imageCount: m.imageCount ?? m.images?.length ?? 0 }));
    const apiMessages = [
      ...prior,
      { role: "user" as const, content: value || "(priložený obrázok)", imageCount: previews.length },
    ];

    const userMsg: Message = {
      id: idRef.current++,
      role: "user",
      content: value,
      images: previews,
      imageCount: previews.length,
    };
    const assistantId = idRef.current++;
    setMessages((m) => [...m, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setPendingImages([]);
    setStreaming(true);
    setStreamingId(assistantId);
    setLoadingContext(true);

    void (async () => {
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: chatIdRef.current, messages: apiMessages, images: imagesForApi }),
        });

        const newId = res.headers.get("X-Chat-Id");
        const src = res.headers.get("X-Context-Source");
        if (newId) {
          setCurrentChatId(newId);
          chatIdRef.current = newId;
        }
        if (src === "google-ads" || src === "mock") setContextSource(src);

        if (!res.ok || !res.body) throw new Error("request failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let first = true;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          if (first) {
            setLoadingContext(false);
            first = false;
          }
          acc += decoder.decode(chunk, { stream: true });
          setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: acc } : msg)));
        }
      } catch {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: "⚠️ Nepodarilo sa spojiť s AI asistentom. Skús to znova." }
              : msg,
          ),
        );
      } finally {
        setStreaming(false);
        setStreamingId(null);
        setLoadingContext(false);
        loadChats();
      }
    })();
  };
  sendRef.current = send;

  useImperativeHandle(ref, () => ({ ask: (q: string) => sendRef.current(q) }));

  const copy = async (msg: Message) => {
    if (await copyToClipboard(msg.content)) {
      setCopiedId(msg.id);
      toast.success("Skopírované do schránky");
      setTimeout(() => setCopiedId((id) => (id === msg.id ? null : id)), 1800);
    }
  };

  return (
    <div
      className={cn(
        "relative flex overflow-hidden rounded-xl border border-border bg-surface",
        className ?? "h-[620px]",
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {/* History sidebar */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-border bg-surface transition-transform sm:static sm:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-3">
          <Button variant="secondary" size="sm" className="w-full" onClick={newChat}>
            <Plus className="h-4 w-4" />
            Nový chat
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {chats.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted">Zatiaľ žiadna história</p>
          ) : (
            chats.map((c) => (
              <button
                key={c.id}
                onClick={() => loadChat(c.id)}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors cursor-pointer",
                  c.id === currentChatId ? "bg-surface-2" : "hover:bg-surface-2/60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{c.title}</p>
                  <p className="text-[10px] text-muted">{formatRelativeTime(c.updatedAt)}</p>
                </div>
                <span
                  onClick={(e) => deleteChat(c.id, e)}
                  className="shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  aria-label="Vymazať"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {sidebarOpen && (
        <div className="absolute inset-0 z-10 bg-black/40 sm:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground sm:hidden cursor-pointer"
            aria-label="História"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">AI Analytik</p>
            <p className="truncate text-xs text-muted">Claude · živý kontext kampaní</p>
          </div>
          {contextSource && (
            <span className="ml-auto">
              {contextSource === "google-ads" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-success">
                  <Radio className="h-3 w-3" />
                  Naživo z Google Ads
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                  <Database className="h-3 w-3" />
                  Demo dáta
                </span>
              )}
            </span>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m) => {
            const isStreamingThis = streamingId === m.id;
            const showContextLoader = isStreamingThis && m.content.length === 0 && loadingContext;
            return (
              <div key={m.id} className={cn("group flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    m.role === "assistant"
                      ? "bg-gradient-to-br from-primary to-secondary text-white"
                      : "bg-surface-2 text-muted",
                  )}
                >
                  {m.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div className={cn("flex max-w-[85%] flex-col gap-1", m.role === "user" && "items-end")}>
                  {/* image thumbnails */}
                  {m.images && m.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.images.map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={img.dataUrl}
                          alt="príloha"
                          className="h-20 w-20 rounded-lg border border-border object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {!m.images && (m.imageCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
                      <Paperclip className="h-3 w-3" />
                      {m.imageCount} {m.imageCount === 1 ? "obrázok" : "obrázky"}
                    </span>
                  )}

                  {(m.content.length > 0 || showContextLoader) && (
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        m.role === "assistant"
                          ? "rounded-tl-sm bg-surface-2 text-foreground"
                          : "rounded-tr-sm bg-primary text-white",
                      )}
                    >
                      {showContextLoader ? (
                        <span className="flex items-center gap-2 text-muted">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          Načítavam reálne dáta kampaní z Google Ads…
                        </span>
                      ) : m.role === "assistant" ? (
                        <>
                          <Markdown>{m.content}</Markdown>
                          {isStreamingThis && (
                            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />
                          )}
                        </>
                      ) : (
                        m.content
                      )}
                    </div>
                  )}

                  {m.role === "assistant" && m.content.length > 0 && !isStreamingThis && (
                    <button
                      onClick={() => copy(m)}
                      className="inline-flex items-center gap-1 self-start text-xs text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 cursor-pointer"
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check className="h-3 w-3" /> Skopírované
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Kopírovať
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Suggestions (only on a fresh chat) */}
        {messages.length <= 1 && pendingImages.length === 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={streaming}
                className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50 cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Pending image previews */}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border px-3 pt-3">
            {pendingImages.map((img) => (
              <div key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
                <button
                  onClick={() => setPendingImages((p) => p.filter((x) => x.id !== img.id))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow cursor-pointer"
                  aria-label="Odstrániť"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50 cursor-pointer"
            aria-label="Nahrať obrázok"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Spýtaj sa na svoje kampane…"
            className="flex-1"
            disabled={streaming}
          />
          <Button type="submit" size="icon" disabled={(!input.trim() && pendingImages.length === 0) || streaming}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* Drag overlay */}
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80">
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <ImagePlus className="h-5 w-5" />
            Pusti obrázok sem
          </p>
        </div>
      )}
    </div>
  );
});
