"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SERVER_URL } from "@/lib/config";
import { useConnection } from "@/store/useConnection";
import type { Channel, Message } from "@/types";
import { getToken } from "@/lib/auth";

interface DisplayMessage extends Message {
  createdAt: number;
  priority: "normal" | "high" | "emergency";
}

const KIND_LABEL: Record<string, string> = {
  general: "Global",
  subject: "Subject",
  section: "Section",
  announcement: "Announcement",
};

export default function AdminConversationsPage() {
  const { baseUrl } = useConnection();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);

  const loadChannels = async () => {
    try {
      setError(null);
      setLoadingChannels(true);
      const token = getToken();
      const res = await fetch(`${apiBase}/channels`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`channels_${res.status}`);
      const data = await res.json();
      const available: Channel[] = (data?.channels || [])
        .filter((ch: Channel) => ["general", "subject"].includes(ch.kind) && ch.name?.trim() !== "1")
        .sort((a: Channel, b: Channel) => a.name.localeCompare(b.name));
      setChannels(available);
      if (available.length > 0 && !selectedChannelId) {
        setSelectedChannelId(available[0].id);
      } else if (selectedChannelId && !available.find((ch) => ch.id === selectedChannelId)) {
        setSelectedChannelId(available[0]?.id || null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load channels");
      setChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      setLoadingMessages(true);
      const token = getToken();
      const res = await fetch(`${apiBase}/channels/${channelId}/messages`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`messages_${res.status}`);
      const data = await res.json();
      const msgs: DisplayMessage[] = (data?.messages || []).map((msg: any) => ({
        ...msg,
        createdAt: typeof msg.createdAt === "number" ? msg.createdAt : new Date(msg.createdAt).getTime(),
        priority: (msg.priority || "normal") as DisplayMessage["priority"],
      }));
      setMessages(msgs);
    } catch (e: any) {
      setError(e?.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (selectedChannelId) {
      loadMessages(selectedChannelId);
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId, apiBase]);

  const selectedChannel = channels.find((ch) => ch.id === selectedChannelId) || null;

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      <div className="grid-layer" />
      <div className="relative z-10 h-dvh grid grid-rows-[64px_1fr] min-h-0">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs md:text-sm text-white/80"
            >
              <span className="sr-only">Back to Dashboard</span>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">CONVERSATION OVERSIGHT</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70 mt-2">
            <button onClick={loadChannels} className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1">Refresh Channels</button>
            {selectedChannelId && (
              <button onClick={() => loadMessages(selectedChannelId)} className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1">Refresh Conversation</button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-3 sm:gap-4 p-3 sm:p-4 min-h-0 overflow-hidden mt-6 sm:mt-4">
          <div className="flex flex-col rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md min-h-0">
            <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-[0.3em] text-white/60 sticky top-0 bg-white/5 backdrop-blur-md z-10">Channels</div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/10">
              {loadingChannels ? (
                <div className="px-4 py-4 text-white/60 text-sm">Loading channels…</div>
              ) : channels.length === 0 ? (
                <div className="px-4 py-4 text-white/60 text-sm">No channels available.</div>
              ) : (
                channels.map((channel) => {
                  const label = KIND_LABEL[channel.kind] || channel.kind;
                  const active = channel.id === selectedChannelId;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => setSelectedChannelId(channel.id)}
                      className={`w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors ${active ? "bg-white/10" : "hover:bg-white/5"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-white truncate">{channel.name}</span>
                        <span className="text-[10px] uppercase tracking-[0.24em] text-white/50 whitespace-nowrap">{label}</span>
                      </div>
                      {channel.topic && (
                        <div className="text-xs text-white/60 line-clamp-2">{channel.topic}</div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md min-h-0 flex flex-col">
            {error && (
              <div className="px-4 py-2 text-sm text-red-300 border-b border-red-400/30 bg-red-500/10">{error}</div>
            )}
            {selectedChannel ? (
              <>
                <div className="px-4 py-3 border-b border-white/10">
                  <div className="text-sm uppercase tracking-[0.3em] text-white/60">Selected Conversation</div>
                  <div className="mt-1 text-xl font-semibold text-white break-words">{selectedChannel.name}</div>
                  {selectedChannel.topic && <div className="text-sm text-white/65 break-words">{selectedChannel.topic}</div>}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loadingMessages ? (
                    <div className="px-4 py-6 text-white/60 text-sm">Loading messages…</div>
                  ) : messages.length === 0 ? (
                    <div className="px-4 py-6 text-white/60 text-sm">No messages yet.</div>
                  ) : (
                    <div className="space-y-3 px-4 py-4">
                      {messages.map((msg) => (
                        <div key={msg.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-white/50">
                            <span className="uppercase tracking-[0.3em]">{msg.priority}</span>
                            <span>{formatTimestamp(msg.createdAt)}</span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-white break-words">{msg.senderName}</div>
                          <div className="mt-1 text-sm text-white/80 whitespace-pre-wrap break-words">{msg.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-white/60 text-sm">Select a channel to begin</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(epoch: number) {
  if (!epoch) return "";
  const date = new Date(epoch);
  return date.toLocaleString();
}
