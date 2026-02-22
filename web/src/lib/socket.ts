"use client";

type Socket = any;
import type { Message } from "@/types";
import { useChatStore } from "@/store/useChat";
import { useAuth } from "@/store/useAuth";

let socket: Socket | null = null;
let currentBase = "";
let listenersBound = false;
let currentSocketId: string | null = null;
let joinedRooms = new Set<string>();
let joinedUserRooms = new Set<string>();

export async function getSocket(baseUrl: string): Promise<Socket> {
  if (typeof window === "undefined") {
    throw new Error("Socket can only be used on the client");
  }
  // Load Socket.IO client: try LAN server first, then CDN
  const io = await loadSocketIoClient(baseUrl);
  // Normalize base URL: if pointing to localhost but we're on a phone or another device,
  // swap hostname to the current page host so it can reach the LAN server.
  let url = baseUrl.replace(/\/$/, "");
  try {
    const u = new URL(url);
    const host = (typeof window !== "undefined" ? window.location.hostname : "");
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && host && host !== "localhost") {
      u.hostname = host;
      url = u.toString().replace(/\/$/, "");
    }
  } catch {}
  if (!socket || currentBase !== url) {
    if (socket) socket.disconnect();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const common = {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true,
      withCredentials: true,
    } as any;
    const opts = isMobile
      ? { ...common, transports: ["polling"], upgrade: false }
      : { ...common, transports: ["websocket", "polling"] };
    socket = io(url, opts);
    currentBase = url;
    // Ensure we rebind listeners for the new socket instance
    listenersBound = false;
  }

  if (socket && !listenersBound) {
    socket.on("connect", () => {
      // eslint-disable-next-line no-console
      console.log("Socket connected", socket?.id);
      currentSocketId = socket?.id ?? null;
      // Re-join any rooms from before the reconnect
      try {
        for (const room of Array.from(joinedRooms)) {
          socket.emit("join", room);
        }
        for (const key of Array.from(joinedUserRooms)) {
          const userId = key.startsWith("user:") ? key.slice(5) : key;
          socket.emit("user:join", userId);
        }
      } catch {}
    });
    socket.on("connect_error", (err: any) => {
      // eslint-disable-next-line no-console
      console.warn("Socket connect_error", err.message);
    });
    socket.on("disconnect", (reason: any) => {
      // eslint-disable-next-line no-console
      console.log("Socket disconnected", reason);
      currentSocketId = null;
      // Keep joinedRooms and joinedUserRooms so we can rejoin on reconnect
    });
    socket.on("message:new", (msg: Message) => {
      // Always accept server echo so messages persist after navigation/refresh
      useChatStore.getState().addIncoming(msg);
      try {
        // If this is a DM and the channel is not yet in the list, add it so it shows up automatically
        if (msg.channelId?.startsWith("dm-")) {
          const st = useChatStore.getState();
          const exists = st.channels.some((c) => c.id === msg.channelId);
          const myId = useAuth.getState().userId;
          const otherIsTeacher = Boolean(msg.senderIsTeacher && msg.senderId && msg.senderId !== myId);
          if (!exists) {
            const ch = {
              id: msg.channelId,
              name: msg.senderName || "Direct Message",
              topic: "Direct Message",
              kind: "dm",
              meta: otherIsTeacher ? { otherIsTeacher: true } : undefined,
            } as any;
            st.setChannels([...st.channels, ch]);
          }
          if (otherIsTeacher && exists) {
            st.setChannels(
              st.channels.map((c) =>
                c.id === msg.channelId ? { ...c, meta: { ...(c.meta || {}), otherIsTeacher: true } } : c,
              ),
            );
          }
        }
      } catch {}
    });

    socket.on("channel:pinned", (evt: { channelId: string; pins: any[] }) => {
      try {
        if (!evt?.channelId) return;
        if (Array.isArray(evt.pins)) {
          useChatStore.getState().setChannelPins(evt.channelId, evt.pins as any);
        }
      } catch {}
    });

    socket.on("typing", (evt: { channelId: string; userId: string; name?: string; isTyping: boolean; ts?: number }) => {
      try {
        if (!evt?.channelId || !evt?.userId) return;
        useChatStore.getState().setTyping(evt.channelId, evt.userId, evt.name || null, !!evt.isTyping);
      } catch {}
    });

    socket.on("presence", (evt: { channelId: string; userId: string; name?: string; online: boolean; ts?: number }) => {
      try {
        if (!evt?.channelId || !evt?.userId) return;
        useChatStore.getState().setPresence(evt.channelId, evt.userId, !!evt.online);
      } catch {}
    });

    // Basic handling for call invites: add a system-like message so users can click the link
    socket.on("call:invite", (evt: { channelId: string; kind: "video" | "voice"; from?: string; link?: string }) => {
      try {
        if (!evt?.channelId) return;
        const text = evt.kind === "video" ? `🎥 Incoming video call: ${evt.link || ""}` : `📞 Incoming voice call: ${evt.link || ""}`;
        useChatStore.getState().addIncoming({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}` as any,
          channelId: evt.channelId,
          text,
          createdAt: Date.now(),
          senderName: evt.from || "System",
          senderId: "system",
          senderAvatarUrl: null,
        } as any);
      } catch {}
    });
    listenersBound = true;
  }
  return socket!;
}

export function isSocketConnected(): boolean {
  try {
    return Boolean(socket && (socket as any).connected === true);
  } catch {
    return false;
  }
}

export async function joinRoom(baseUrl: string, channelId: string): Promise<void> {
  if (!channelId) return;
  const s = await getSocket(baseUrl);
  if (!joinedRooms.has(channelId)) {
    // Add first so connect handler can re-emit on successful connection
    joinedRooms.add(channelId);
    try {
      if (s.connected) s.emit("join", channelId);
    } catch {}
  }
}

export async function joinUserRoom(baseUrl: string, userId: string): Promise<void> {
  if (!userId) return;
  const s = await getSocket(baseUrl);
  const key = `user:${userId}`;
  if (!joinedUserRooms.has(key)) {
    // Add first so connect handler can re-emit on successful connection
    joinedUserRooms.add(key);
    try {
      if (s.connected) s.emit("user:join", userId);
    } catch {}
  }
}

async function loadSocketIoClient(baseUrl: string): Promise<(url: string, opts?: any) => Socket> {
  const w = window as any;
  if (w.io && typeof w.io === "function") return w.io;
  if (w.__io_loading) return await w.__io_loading;

  const candidates: string[] = [];
  try {
    const u = new URL(baseUrl);
    const origin = `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}`;
    candidates.push(`${origin}/socket.io/socket.io.min.js`);
    candidates.push(`${origin}/socket.io/socket.io.js`);
  } catch {}
  // CDN fallback
  candidates.push("https://cdn.socket.io/4.8.1/socket.io.min.js");

  w.__io_loading = (async () => {
    for (const src of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(script);
        });
        if (w.io && typeof w.io === "function") return w.io;
      } catch {
        // try next
      }
    }
    throw new Error("Unable to load socket.io client script");
  })();

  try {
    const io = await w.__io_loading;
    return io;
  } finally {
    w.__io_loading = null;
  }
}
