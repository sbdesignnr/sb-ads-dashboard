"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Send, Sparkles, Bot, User, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildAIContext } from "@/lib/ai-context";
import { copyToClipboard } from "@/lib/export";
import { cn } from "@/lib/utils";

export interface AIChatHandle {
  ask: (question: string) => void;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Ktorá kampaň má najhorší ROAS?",
  "Ako nastaviť kampaň na webstránky?",
  "Kde ušetrím budget?",
  "Navrhni long-tail kľúčové slová",
  "Ako zlepšiť CTR?",
];

const GREETING: Message = {
  id: 0,
  role: "assistant",
  content:
    "Ahoj! Som AI analytik SB Design poháňaný modelom Claude. Mám prístup k dátam tvojich kampaní — opýtaj sa ma na výkon, ROAS, rozpočet, kľúčové slová alebo si vyžiadaj konkrétny akčný plán.",
};

const markdownComponents: Components = {
  p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-2 ml-4 list-disc space-y-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-2 ml-4 list-decimal space-y-1" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  h1: ({ node, ...props }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold text-foreground" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold text-foreground" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold text-foreground" {...props} />
  ),
  code: ({ node, ...props }) => (
    <code className="rounded bg-surface px-1 py-0.5 text-xs text-primary" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />
  ),
};

export const AIChat = forwardRef<AIChatHandle, { className?: string }>(
  function AIChat({ className }, ref) {
    const [messages, setMessages] = useState<Message[]>([GREETING]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const [streamingId, setStreamingId] = useState<number | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const idRef = useRef(1);
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<Message[]>(messages);
    messagesRef.current = messages;

    const context = useMemo(() => buildAIContext(), []);

    useImperativeHandle(ref, () => ({
      ask: (question: string) => void send(question),
    }));

    useEffect(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const send = async (text: string) => {
      const value = text.trim();
      if (!value || streaming) return;

      const apiMessages = [
        ...messagesRef.current
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: value },
      ].slice(-10);

      const userMsg: Message = { id: idRef.current++, role: "user", content: value };
      const assistantId = idRef.current++;
      setMessages((m) => [...m, userMsg, { id: assistantId, role: "assistant", content: "" }]);
      setInput("");
      setStreaming(true);
      setStreamingId(assistantId);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            accountMetrics: context.accountMetrics,
            campaignData: context.campaignData,
          }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "request_failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          acc += decoder.decode(chunk, { stream: true });
          setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: acc } : msg)));
        }
      } catch {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: "⚠️ Nepodarilo sa spojiť s AI asistentom. Skús to prosím znova.",
                }
              : msg,
          ),
        );
      } finally {
        setStreaming(false);
        setStreamingId(null);
      }
    };

    const copy = async (msg: Message) => {
      const ok = await copyToClipboard(msg.content);
      if (ok) {
        setCopiedId(msg.id);
        setTimeout(() => setCopiedId((id) => (id === msg.id ? null : id)), 1800);
      }
    };

    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-xl border border-border bg-surface",
          className ?? "h-[560px]",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">AI Analytik</p>
            <p className="text-xs text-muted">Claude · live nad dátami kampaní</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m) => {
            const isStreamingThis = streaming && streamingId === m.id;
            const showDots = isStreamingThis && m.content.length === 0;
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
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      m.role === "assistant"
                        ? "rounded-tl-sm bg-surface-2 text-foreground"
                        : "rounded-tr-sm bg-primary text-white",
                    )}
                  >
                    {showDots ? (
                      <span className="flex items-center gap-1 py-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </span>
                    ) : m.role === "assistant" ? (
                      <div className="ai-markdown">
                        <ReactMarkdown components={markdownComponents}>{m.content}</ReactMarkdown>
                        {isStreamingThis && (
                          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />
                        )}
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>

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

        {messages.length <= 1 && (
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Spýtaj sa na svoje kampane…"
            className="flex-1"
            disabled={streaming}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || streaming}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    );
  },
);
