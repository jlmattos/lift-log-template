"use client";

import { memo, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createConversation,
  deleteConversation,
  getConversation,
  setConversationTitle,
  type ChatModel,
  type Conversation,
  type ChatMessage,
} from "@/actions/chat";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toDisplay = (m: { role: "user" | "assistant"; content: any }): DisplayMessage => ({
  role: m.role,
  content: Array.isArray(m.content) ? m.content : [],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock = any;
type DisplayMessage = { role: "user" | "assistant"; content: ContentBlock[]; streamingText?: string; toolActivity?: string[] };

const SUGGESTED_PROMPTS = [
  "Pull every tool you have and give me a complete inventory of what you know about my training. Then tell me what's most important right now.",
  "Audit my full routine: every week, every day, every exercise. Tell me what's well-balanced, what's underweighted, what to change.",
  "Should I push today or back off?",
  "Why isn't my bench moving?",
  "Review my asymmetry — what should I prioritize fixing?",
];

export function ChatView({
  initialConversations,
  initialActiveId,
  initialMessages,
  initialModel,
}: {
  initialConversations: Conversation[];
  initialActiveId: string | null;
  initialMessages: ChatMessage[];
  initialModel: ChatModel;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages.map(toDisplay));
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ChatModel>(initialModel);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // When the active chat is cleared, empty the transcript. Done during render
  // via previous-value tracking — React's sanctioned alternative to a
  // state-setting effect (the async load below stays in an effect).
  const [prevActiveId, setPrevActiveId] = useState(activeId);
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId);
    if (!activeId) setMessages([]);
  }

  // Load the conversation when activeId changes mid-session (e.g., user opens
  // History → picks another chat). The server-rendered page handles the initial
  // load; this only handles client-side navigation.
  useEffect(() => {
    if (!activeId) return;
    if (initialActiveId === activeId) return; // already populated by SSR
    let cancelled = false;
    (async () => {
      const { conversation, messages: msgs } = await getConversation(activeId);
      if (cancelled) return;
      if (conversation) {
        setModel(conversation.model);
        setMessages(msgs.map(toDisplay));
      }
    })();
    return () => { cancelled = true; };
  }, [activeId, initialActiveId]);

  // Autoscroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function ensureConversation(): Promise<string> {
    if (activeId) return activeId;
    const c = await createConversation(model);
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    router.replace(`/chat?c=${c.id}`);
    return c.id;
  }

  async function send(promptOverride?: string) {
    const text = (promptOverride ?? input).trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);
    setInput("");

    const convId = await ensureConversation();

    const userMsg: DisplayMessage = {
      role: "user",
      content: [{ type: "text", text }],
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: DisplayMessage = {
      role: "assistant",
      content: [],
      streamingText: "",
      toolActivity: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    // Build the API payload — full conversation history so far + this user message
    const payloadMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, model, messages: payloadMessages }),
      });

      if (!res.ok || !res.body) {
        if (res.status === 504) {
          throw new Error("Request timed out (>60s). Try a smaller question, or switch to Sonnet — it's faster than Opus for multi-tool questions.");
        }
        throw new Error(`Chat API error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE-ish data: lines
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const obj = JSON.parse(line) as
              | { type: "text"; text: string }
              | { type: "tool_use"; name: string; input: unknown }
              | { type: "tool_result"; name: string; ok: boolean; summary?: string }
              | { type: "done"; inputTokens: number; outputTokens: number }
              | { type: "error"; message: string };

            if (obj.type === "text") {
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                const last = next[i];
                if (!last || last.role !== "assistant") return prev;
                const newText = (last.streamingText ?? "") + obj.text;
                // Create a NEW message object so React detects the change reliably,
                // especially under iOS Safari PWA streaming quirks.
                next[i] = {
                  ...last,
                  streamingText: newText,
                  content: [{ type: "text", text: newText }],
                };
                return next;
              });
            } else if (obj.type === "tool_use") {
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                const last = next[i];
                if (!last || last.role !== "assistant") return prev;
                next[i] = {
                  ...last,
                  toolActivity: [...(last.toolActivity ?? []), obj.name],
                };
                return next;
              });
            } else if (obj.type === "tool_result") {
              // Visual confirmation showing WHAT data came back, not just success.
              setMessages((prev) => {
                const next = prev.slice();
                const i = next.length - 1;
                const last = next[i];
                if (!last || last.role !== "assistant") return prev;
                const activity = (last.toolActivity ?? []).slice();
                // Replace the in-progress entry with one that includes the summary
                for (let j = activity.length - 1; j >= 0; j--) {
                  const entry = activity[j];
                  if (entry === obj.name || entry.endsWith(obj.name)) {
                    const sym = obj.ok ? "✓" : "✗";
                    const summary = obj.summary ? ` — ${obj.summary}` : "";
                    activity[j] = `${sym} ${obj.name}${summary}`;
                    break;
                  }
                }
                next[i] = { ...last, toolActivity: activity };
                return next;
              });
            } else if (obj.type === "error") {
              setError(obj.message);
            } else if (obj.type === "done") {
              // Set title from first user message if conversation has none
              const isFirstExchange = messages.length === 0;
              if (isFirstExchange) {
                const title = text.slice(0, 70);
                startTransition(async () => {
                  await setConversationTitle(convId, title);
                  setConversations((prev) =>
                    prev.map((c) => (c.id === convId ? { ...c, title } : c))
                  );
                });
              }

              // Safety net: if streaming somehow didn't deliver text to the
              // UI (cached old client, iOS buffering quirk, etc.) but the
              // server says it's done, refetch the conversation from the DB
              // so the user sees the persisted answer regardless.
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.streamingText) {
                  // Streaming failed to populate — refetch
                  getConversation(convId).then(({ messages: saved }) => {
                    setMessages(saved.map((m) => ({ role: m.role, content: m.content })));
                  });
                }
                return prev;
              });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(`Chat request failed: ${msg}`);
      // Mark the empty assistant bubble so user sees the failure
      setMessages((prev) => {
        const next = prev.slice();
        const i = next.length - 1;
        const last = next[i];
        if (last && last.role === "assistant" && !last.streamingText) {
          next[i] = {
            ...last,
            content: [{ type: "text", text: "(Request failed. Try again or check your connection.)" }],
          };
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  async function startNew() {
    setActiveId(null);
    setMessages([]);
    setError(null);
    router.push("/chat?new=1");
  }

  async function deleteConv(id: string) {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) startNew();
  }

  // Export the current conversation as markdown to the clipboard, so it can be
  // pasted into an external Claude (e.g. a Cowork project) to continue the
  // thread there without further in-app API calls.
  const [copied, setCopied] = useState(false);
  function conversationToMarkdown(): string {
    const lines: string[] = ["# Lift Log — Ask Claude conversation", ""];
    for (const m of messages) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (m.content as any[])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (m.role === "user") {
        lines.push(`## Me`, "", text, "");
      } else {
        const tools = m.toolActivity ?? [];
        lines.push(`## Claude`, "");
        if (tools.length > 0) lines.push(`_(pulled data via: ${tools.join(", ")})_`, "");
        if (text) lines.push(text, "");
      }
    }
    return lines.join("\n").trim() + "\n";
  }

  async function copyForCowork() {
    const md = conversationToMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy — long-press the chat to select manually.");
    }
  }

  return (
    <div className="space-y-3 pb-[140px]">
      {/* Toolbar: model toggle + history + new */}
      <div className="flex items-center gap-2">
        <div className="flex bg-muted/40 rounded-md p-0.5">
          <button
            onClick={() => setModel("claude-sonnet-4-5")}
            className={`text-[11px] px-2 py-1 rounded transition-colors ${
              model === "claude-sonnet-4-5" ? "bg-blue-400 text-background font-medium" : "text-muted-foreground"
            }`}
          >
            Sonnet
          </button>
          <button
            onClick={() => setModel("claude-opus-4-7")}
            className={`text-[11px] px-2 py-1 rounded transition-colors ${
              model === "claude-opus-4-7" ? "bg-purple-400 text-background font-medium" : "text-muted-foreground"
            }`}
          >
            Opus
          </button>
        </div>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          History ({conversations.length})
        </button>
        {messages.length > 0 && (
          <button
            onClick={copyForCowork}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            title="Copy this conversation as markdown to paste into a Cowork project"
          >
            {copied ? "✓ Copied" : "Export"}
          </button>
        )}
        <button
          onClick={startNew}
          className={`${messages.length > 0 ? "" : "ml-auto"} text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1`}
        >
          + New
        </button>
      </div>

      {/* History drawer */}
      {showHistory && (
        <Card className="p-2 max-h-64 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No previous chats.</p>
          ) : (
            <div className="space-y-1">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 text-xs p-2 rounded hover:bg-accent/40 ${
                    c.id === activeId ? "bg-blue-400/10" : ""
                  }`}
                >
                  <button
                    onClick={() => { router.push(`/chat?c=${c.id}`); setShowHistory(false); }}
                    className="flex-1 text-left truncate"
                  >
                    {c.title ?? "Untitled chat"}
                  </button>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(c.updated_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                  </span>
                  <button
                    onClick={() => deleteConv(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Messages */}
      <div className="space-y-3 min-h-[40vh]">
        {messages.length === 0 ? (
          <Card className="p-4 space-y-3">
            <p className="text-sm">
              I have access to your full Lift Log data — workouts, TSB, plateaus, ratios, cardio, wellness, and your profile.
              Ask anything.
            </p>
            <div className="space-y-1.5 pt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Try asking</p>
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={sending}
                  className="block w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 p-2 rounded transition-colors"
                >
                  → {p}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} message={m} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <Card className="p-3 bg-red-400/10 border-red-400/30">
          <p className="text-xs text-red-300">{error}</p>
        </Card>
      )}

      {/* Input bar — fixed to bottom */}
      <div className="fixed bottom-[80px] left-0 right-0 px-4">
        <div className="max-w-md lg:max-w-2xl mx-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2 bg-card border border-border rounded-2xl p-2 shadow-lg"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask Claude..."
              disabled={sending}
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none px-2 py-1.5 outline-none min-h-[36px] max-h-[120px]"
            />
            <Button type="submit" disabled={!input.trim() || sending} className="h-9 px-4">
              {sending ? "..." : "Send"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Memoized so typing in the input (which re-renders ChatView on every keystroke)
// doesn't re-run ReactMarkdown for every prior message. During typing the
// `message` references are unchanged, so memoized bubbles skip re-rendering
// entirely — the lag was every keystroke re-parsing the whole conversation.
const MessageBubble = memo(function MessageBubble({ message }: { message: DisplayMessage }) {
  if (message.role === "user") {
    const text = message.content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => b.text)
      .join("\n");
    return (
      <div className="flex justify-end">
        <div className="bg-blue-400 text-background px-3 py-2 rounded-2xl rounded-tr-sm max-w-[85%]">
          <p className="text-sm whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  // Assistant: render text blocks + tool activity badges
  const textBlocks = message.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text" && b.text)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join("\n");

  const hasContent = textBlocks.trim().length > 0;
  const tools = message.toolActivity ?? [];

  return (
    <div className="space-y-1.5">
      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tools.map((t, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
              🔧 {t}
            </span>
          ))}
        </div>
      )}
      {hasContent ? (
        <div className="text-sm leading-relaxed">
          <Markdown content={textBlocks} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          {tools.length > 0 ? "Analyzing your data…" : "Thinking…"}
        </p>
      )}
    </div>
  );
});

// Tight, chat-appropriate markdown styling — preserves Claude's structure
// (headers, bold, lists, code, tables) without taking over the bubble.
function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Paragraphs: normal text spacing
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,

        // Headers: scaled down for chat density
        h1: ({ children }) => <h1 className="text-base font-bold mt-4 first:mt-0 mb-1.5">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-3 first:mt-0 mb-1 uppercase tracking-wider text-blue-300">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 first:mt-0 mb-1">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-semibold mt-2 first:mt-0 mb-1 text-muted-foreground">{children}</h4>,

        // Emphasis
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,

        // Lists: tight spacing
        ul: ({ children }) => <ul className="my-2 ml-4 space-y-1 list-disc marker:text-muted-foreground">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 ml-4 space-y-1 list-decimal marker:text-muted-foreground">{children}</ol>,
        li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,

        // Code
        code: ({ children, ...props }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const inline = !(props as any).className;
          return inline
            ? <code className="px-1 py-0.5 rounded bg-muted text-blue-300 font-mono text-[0.85em]">{children}</code>
            : <code className="block px-2 py-1.5 rounded bg-muted text-foreground font-mono text-xs whitespace-pre-wrap overflow-x-auto">{children}</code>;
        },
        pre: ({ children }) => <pre className="my-2 rounded bg-muted">{children}</pre>,

        // Tables (gfm)
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
        th: ({ children }) => <th className="px-2 py-1 text-left font-semibold text-muted-foreground bg-muted/30">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 align-top">{children}</td>,

        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 my-2 text-muted-foreground italic">
            {children}
          </blockquote>
        ),

        // Horizontal rule
        hr: () => <hr className="my-3 border-border" />,

        // Links
        a: ({ children, href }) => (
          <a href={href} className="text-blue-300 underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
