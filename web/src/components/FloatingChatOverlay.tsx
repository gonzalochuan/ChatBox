"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "@/store/useUI";
import { useChatStore } from "@/store/useChat";
import { useConnection } from "@/store/useConnection";
import { useAuth } from "@/store/useAuth";

export default function FloatingChatOverlay() {
  const { activeFloatingChat, setActiveFloatingChat, setChannelFilter } = useUI();
  const { messages: messagesMap, channels, sendMessage, setActiveChannel } = useChatStore();
  const { baseUrl } = useConnection();
  const { userId } = useAuth();

  const channel = useMemo(() => 
    channels.find(c => c.id === activeFloatingChat), 
    [channels, activeFloatingChat]
  );

  const messages = useMemo(() => 
    messagesMap[activeFloatingChat || ""] || [], 
    [messagesMap, activeFloatingChat]
  );

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Set initial position once window is available
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPos({ 
        x: window.innerWidth - 320 - 20, 
        y: window.innerHeight - 450 - 100 
      });
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeFloatingChat]);

  if (!activeFloatingChat || !channel) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    startPos.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - startPos.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 450, e.clientY - startPos.current.y));
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(activeFloatingChat, text.trim());
    setText("");
  };

  return (
    <div 
      className="fixed z-[10001] w-[320px] h-[450px] bg-[color:var(--surface)] border border-white/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden pointer-events-auto transition-transform duration-300 scale-100 origin-bottom-right"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
      }}
    >
      {/* Header (Draggable) */}
      <div 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="h-14 bg-[color:var(--surface-2)] border-b border-white/10 px-3 flex items-center justify-between cursor-move touch-none"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center overflow-hidden">
            {channel.meta?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.meta.avatarUrl as string} alt={channel.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-emerald-600">{channel.name[0]}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-[color:var(--foreground)] truncate max-w-[120px]">{channel.name}</span>
            <span className="text-[10px] text-emerald-500 font-medium">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Expand to full screen */}
          <button 
            onClick={() => {
              setActiveChannel(channel.id);
              setChannelFilter("chats");
              setActiveFloatingChat(null);
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-[color:var(--muted)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
          </button>
          {/* Close */}
          <button 
            onClick={() => setActiveFloatingChat(null)}
            className="p-1.5 hover:bg-red-500/20 hover:text-red-500 rounded-lg text-[color:var(--muted)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 custom-scroll space-y-3 bg-[color:var(--background)]/50"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 transform scale-75">
             <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
             <p className="mt-2 font-medium">No messages yet</p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === userId;
            return (
              <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm shadow-sm ${
                  isMe 
                    ? "bg-emerald-500 text-white rounded-tr-none" 
                    : "bg-[color:var(--surface-2)] text-[color:var(--foreground)] rounded-tl-none"
                }`}>
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="p-3 bg-[color:var(--surface)] border-t border-white/10 flex gap-2">
        <input 
          type="text" 
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 bg-[color:var(--surface-2)] text-sm px-4 py-2 rounded-xl outline-none border border-transparent focus:border-emerald-500/30 transition-all font-medium"
        />
        <button 
          onClick={handleSend}
          disabled={!text.trim()}
          className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
      </div>
    </div>
  );
}
