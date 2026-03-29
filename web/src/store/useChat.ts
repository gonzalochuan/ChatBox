import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Channel, Message, PinnedMessageInfo } from "@/types";
import { useAuth } from "@/store/useAuth";

interface ChatState {
  channels: Channel[];
  messages: Record<string, Message[]>; // channelId -> messages
  activeChannelId: string | null;
  setActiveChannel: (id: string | null) => void;
  sendMessage: (channelId: string, text: string, context?: Message["context"]) => string;
  setChannels: (chs: Channel[]) => void;
  setChannelMessages: (channelId: string, msgs: Message[]) => void;
  addIncoming: (msg: Message) => void;
  createDm: (myId: string, personId: string, personName: string, meta?: Record<string, unknown>) => string; // returns channelId
  pinnedByChannel: Record<string, PinnedMessageInfo[]>;
  setChannelPins: (channelId: string, pins: PinnedMessageInfo[]) => void;
  upsertPin: (channelId: string, pin: PinnedMessageInfo) => void;
  removePin: (channelId: string, messageId: string) => void;
  typingByChannel: Record<string, Record<string, number>>; // channelId -> (userId -> lastTs)
  setTyping: (channelId: string, userId: string, name: string | null, isTyping: boolean) => void;
  presenceByChannel: Record<string, Record<string, number>>; // channelId -> (userId -> lastSeenTs)
  setPresence: (channelId: string, userId: string, online: boolean) => void;
  unreadCounts: Record<string, number>;
  totalUnread: () => number;
  markAllRead: () => void;
  incrementUnread: (channelId: string, amount?: number) => void;
  syncPendingMessages: (baseUrl: string) => Promise<void>;
  startBackgroundSync: (baseUrl: string) => void;
}

function genId(): string {
  try {
    // @ts-ignore - not all environments have randomUUID
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      // @ts-ignore
      return (crypto as any).randomUUID();
    }
  } catch {}
  // Fallback UUID-like string
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${Date.now().toString(36)}-${s4()}${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      channels: [
        // Public/global channels
        { id: "gen", name: "General", topic: "Campus-wide", kind: "general" },
      ],
      messages: {
        gen: [],
      },
      activeChannelId: null,
      pinnedByChannel: {},
      unreadCounts: {},
      typingByChannel: {},
      presenceByChannel: {},
      setActiveChannel: (id) => {
        const unread = { ...get().unreadCounts };
        if (id) unread[id] = 0;
        set({ activeChannelId: id, unreadCounts: unread });
      },
      sendMessage: (channelId, text, context) => {
        const auth = useAuth.getState();
        const msgId = genId();
        const msg: Message = {
          id: msgId,
          channelId,
          text,
          createdAt: Date.now(),
          senderId: auth.userId || "anonymous",
          senderName: auth.displayName || "You",
          senderAvatarUrl: auth.avatarUrl || null,
          status: "pending",
          priority: "normal",
          context: context ?? null,
          senderIsTeacher: auth.isTeacher,
        };
        const current = get().messages[channelId] ?? [];
        set({
          messages: { ...get().messages, [channelId]: [...current, msg] },
          channels: get().channels.map(ch => ch.id === channelId ? { ...ch, lastActiveAt: msg.createdAt } : ch)
        });

        // Trigger immediate sync pulse if any base URL exists
        const connection = (useChatStore.getState() as any).baseUrl || (globalThis as any)._lastBaseUrl;
        if (connection) {
          get().syncPendingMessages(connection);
        }

        return msgId;
      },
      setChannels: (chs) => set({ channels: chs }),
      setChannelPins: (channelId, pins) => {
        if (!channelId) return;
        const state = get();
        const nextPins = Array.isArray(pins) ? pins : [];
        const pinnedByChannel = { ...state.pinnedByChannel, [channelId]: nextPins };
        const channels = state.channels.map((ch) =>
          ch.id === channelId
            ? {
                ...ch,
                pins: nextPins,
              }
            : ch,
        );
        let messages = state.messages;
        for (const pin of nextPins) {
          const msg = pin.message;
          if (!msg) continue;
          const current = [...(state.messages[channelId] || [])];
          const idx = current.findIndex((m) => m.id === msg.id);
          const normalized: Message = {
            id: msg.id,
            channelId: msg.channelId,
            senderId: msg.senderId || "",
            senderName: msg.senderName || "",
            senderAvatarUrl: msg.senderAvatarUrl ?? null,
            senderSocketId: msg.senderSocketId,
            text: msg.text,
            createdAt: typeof msg.createdAt === "number" ? msg.createdAt : Date.now(),
            priority: msg.priority || "normal",
            senderIsTeacher: msg.senderIsTeacher,
            context: msg.context ?? null,
          } as Message;
          if (idx >= 0) current[idx] = { ...current[idx], ...normalized };
          else current.push(normalized);
          current.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          messages = { ...messages, [channelId]: current };
        }
        set({ pinnedByChannel, channels, messages });
      },
      upsertPin: (channelId, pin) => {
        if (!channelId || !pin) return;
        const state = get();
        const pins = [...(state.pinnedByChannel[channelId] || [])];
        const idx = pins.findIndex((p) => p.id === pin.id || p.message.id === pin.message.id);
        if (idx >= 0) pins[idx] = pin;
        else pins.unshift(pin);
        get().setChannelPins(channelId, pins);
      },
      removePin: (channelId, messageId) => {
        if (!channelId) return;
        const state = get();
        const pins = (state.pinnedByChannel[channelId] || []).filter((p) => p.message.id !== messageId);
        get().setChannelPins(channelId, pins);
      },
      setChannelMessages: (channelId, msgs) => {
        const current = get().messages[channelId] || [];
        const pending = current.filter(m => m.status === "pending");
        // Filter out any pending messages that now exist on the server (matched by ID)
        const serverIds = new Set(msgs.map(m => m.id));
        const relevantPending = pending.filter(m => !serverIds.has(m.id));
        const merged = [...msgs, ...relevantPending.map(m => ({ ...m, status: "pending" as const }))];
        // Sort by createdAt to ensure correct chronological order
        merged.sort((a, b) => a.createdAt - b.createdAt);
        set({ messages: { ...get().messages, [channelId]: merged } });
      },
      addIncoming: (msg) => {
        if (!msg?.channelId) return;
        const current = get().messages[msg.channelId] ?? [];
        if (msg.id) {
          const idx = current.findIndex((m) => m.id === msg.id);
          if (idx >= 0) {
            const updated = [...current];
            updated[idx] = { ...updated[idx], ...msg, status: "sent" as const };
            const nextMessages = { ...get().messages, [msg.channelId]: updated };
            set({
              messages: nextMessages,
              channels: get().channels.map(ch => ch.id === msg.channelId ? { ...ch, lastActiveAt: msg.createdAt } : ch)
            });
            return;
          }
        }
        const nextMessages = { ...get().messages, [msg.channelId]: [...current, { ...msg, status: "sent" as const }] };
        set({
          messages: nextMessages,
          channels: get().channels.map(ch => ch.id === msg.channelId ? { ...ch, lastActiveAt: msg.createdAt } : ch)
        });
        const active = get().activeChannelId;
        const unread = { ...get().unreadCounts };
        const myId = useAuth.getState().userId;
        const isSelf = myId && msg.senderId && msg.senderId === myId;
        if (!isSelf && (!active || active !== msg.channelId)) {
          unread[msg.channelId] = (unread[msg.channelId] || 0) + 1;
        }
        let channels = get().channels;
        const isDm = typeof msg.channelId === "string" && msg.channelId.startsWith("dm-");
        if (isDm && msg.senderIsTeacher && !isSelf) {
          channels = channels.map((ch) => (ch.id === msg.channelId ? { ...ch, meta: { ...(ch.meta || {}), otherIsTeacher: true } } : ch));
        }
        set({ messages: nextMessages, unreadCounts: unread, channels });
      },
      incrementUnread: (channelId, amount = 1) => {
        if (!channelId) return;
        const unread = { ...get().unreadCounts };
        unread[channelId] = (unread[channelId] || 0) + amount;
        set({ unreadCounts: unread });
      },
      setTyping: (channelId, userId, _name, isTyping) => {
        const byChannel = { ...get().typingByChannel };
        const now = Date.now();
        const existing = { ...(byChannel[channelId] || {}) };
        // purge stale (>6s) first
        for (const [uid, ts] of Object.entries(existing)) {
          if (now - (ts as number) > 6000) delete (existing as any)[uid];
        }
        if (isTyping) existing[userId] = now; else delete (existing as any)[userId];
        byChannel[channelId] = existing;
        set({ typingByChannel: byChannel });
      },
      setPresence: (channelId, userId, online) => {
        const byChannel = { ...get().presenceByChannel };
        const now = Date.now();
        const existing = { ...(byChannel[channelId] || {}) };
        // purge stale (>30s)
        for (const [uid, ts] of Object.entries(existing)) {
          if (now - (ts as number) > 30000) delete (existing as any)[uid];
        }
        if (online) existing[userId] = now; else delete (existing as any)[userId];
        byChannel[channelId] = existing;
        set({ presenceByChannel: byChannel });
      },
      totalUnread: () => Object.values(get().unreadCounts).reduce((a, b) => a + (b || 0), 0),
      markAllRead: () => set({ unreadCounts: {} }),
      createDm: (myId, personId, personName, meta) => {
        // Build symmetric DM channel id so both ends share the same room
        const a = String(myId || "").trim();
        const b = String(personId || "").trim();
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const id = `dm-${lo}-${hi}`;
        const existing = get().channels.find((c) => c.kind === "dm" && c.id === id);
        if (existing) {
          if (meta && Object.keys(meta).length > 0) {
            set({
              channels: get().channels.map((c) => (c.id === existing.id ? { ...c, meta: { ...(c.meta || {}), ...meta } } : c)),
            });
          }
          set({ activeChannelId: existing.id });
          return existing.id;
        }
        const ch: Channel = { id, name: personName, topic: "Direct Message", kind: "dm", meta };
        set({ channels: [...get().channels, ch] });
        if (!get().messages[id]) {
          set({ messages: { ...get().messages, [id]: [] } });
        }
        set({ activeChannelId: id });
        return id;
      },
      syncPendingMessages: async (baseUrl) => {
        if (!baseUrl) return;
        const state = get();
        const allPending: Message[] = [];
        for (const chId in state.messages) {
          const chMsgs = state.messages[chId];
          const pendingInCh = (chMsgs || []).filter((m: Message) => m.status === "pending");
          allPending.push(...pendingInCh);
        }
        if (allPending.length === 0) return;

        try {
          // Store the last base for the pulse trigger
          (globalThis as any)._lastBaseUrl = baseUrl;

          const { getSocket, joinRoom } = await import("@/lib/socket");
          const socket = await getSocket(baseUrl);
          
          if (!socket.connected) {
            await new Promise<void>((resolve, reject) => {
              const t = setTimeout(() => reject(new Error("connect_timeout")), 2000); // Shorter timeout (2s)
              socket.once("connect", () => { clearTimeout(t); resolve(); });
              socket.connect();
            });
          }

          for (const m of allPending) {
            await joinRoom(baseUrl, m.channelId);
            socket.emit("message:send", {
              id: m.id,
              channelId: m.channelId,
              text: m.text,
              senderId: m.senderId,
              senderName: m.senderName,
              senderAvatarUrl: m.senderAvatarUrl,
              priority: m.priority,
              context: m.context
            });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log("[sync] Attempt failed (offline or no load)", err);
        }
      },
      startBackgroundSync: (baseUrl) => {
        if (!baseUrl) return;
        // avoid double intervals
        if ((globalThis as any)._chatSyncInterval) clearInterval((globalThis as any)._chatSyncInterval);
        (globalThis as any)._chatSyncInterval = setInterval(() => {
          get().syncPendingMessages(baseUrl);
        }, 10000); // Try every 10 seconds
      },
    }),
    {
      name: "chat-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        channels: state.channels,
        messages: state.messages,
        unreadCounts: state.unreadCounts,
        pinnedByChannel: state.pinnedByChannel,
      }),
    }
  )
);
