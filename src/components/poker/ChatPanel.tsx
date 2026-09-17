"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  meId: string | null;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, meId, onSend }: ChatPanelProps) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="chat-panel flex h-full min-w-0 w-full flex-col">
      <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Chat</h3>
      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
        {messages.length === 0 && <p className="text-xs text-[var(--text-secondary)]">No messages yet.</p>}
        {messages.map((m) =>
          m.type === "system" ? (
            <p key={m.id} className="text-center text-[10px] italic text-[var(--text-secondary)]">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="flex items-start gap-2">
              <PlayerAvatar name={m.playerName ?? "?"} size="xs" className="mt-0.5" />
              <div className="chat-bubble min-w-0" title={new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}>
                <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                  {m.playerId === meId ? "You" : m.playerName}
                </p>
                <p className="break-words text-xs text-[var(--text-primary)]">{m.text}</p>
              </div>
            </div>
          )
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t border-white/8 pt-2">
        <input
          aria-label="Chat message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Message…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-lime)]/40"
        />
        <button
          aria-label="Send message"
          onClick={submit}
          disabled={!text.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] transition-opacity disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
