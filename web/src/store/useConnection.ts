"use client";

import { create } from "zustand";

export type ConnectionMode = "lan" | "cloud" | "offline";

interface ConnectionState {
  mode: ConnectionMode;
  baseUrl: string | null;
  initializing: boolean;
  setMode: (m: ConnectionMode, baseUrl: string | null) => void;
  init: () => Promise<void>;
  setUserLanUrl: (url: string | null) => void;
  reinit: () => Promise<void>;
  setLan: (url?: string | null) => Promise<void>;
  setInternet: (url?: string | null) => Promise<void>;
  toggleInternet: () => Promise<void>;
}

async function tryHealth(url: string, timeoutMs = 2500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: ctrl.signal,
    });
    if (!r.ok) return false;
    const data = await r.json().catch(() => ({}));
    return Boolean(data?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function getStoredLan(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("chatbox.lanBaseUrl");
  } catch {
    return null;
  }
}

function setStoredLan(url: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (url) localStorage.setItem("chatbox.lanBaseUrl", url);
    else localStorage.removeItem("chatbox.lanBaseUrl");
  } catch {}
}

export const useConnection = create<ConnectionState>((set, get) => ({
  mode: "offline",
  baseUrl: null,
  initializing: false,
  setMode: (m, baseUrl) => set({ mode: m, baseUrl }),
  init: async () => {
    const s = get();
    if (s.initializing) return; // Prevent double-init
    set({ initializing: true });
    
    const userLan = getStoredLan();
    const isProd = process.env.NODE_ENV === "production";
    const cloud = process.env.NEXT_PUBLIC_CLOUD_BASE_URL || "";
    const lan = isProd
      ? (userLan || process.env.NEXT_PUBLIC_LAN_BASE_URL || "")
      : (userLan || process.env.NEXT_PUBLIC_LAN_BASE_URL || "http://localhost:4000");

    // Proactive Socket Kickstart (Speeds up mobile resume!)
    // If we have a cloud URL, we speculate we'll need it.
    if (cloud) {
      // Trigger a silent sync pulse in the background immediately
      import("@/store/useChat").then(m => m.useChatStore.getState().syncPendingMessages(cloud));
    }

    // Concurrent Discovery: Try both Cloud and LAN at the same time. Fast wins!
    try {
      const results = await Promise.all([
        cloud ? tryHealth(cloud, 3000) : Promise.resolve(false),
        lan ? tryHealth(lan, 3000) : Promise.resolve(false)
      ]);

      const [cloudOk, lanOk] = results;
      
      if (cloudOk) {
        set({ mode: "cloud", baseUrl: cloud, initializing: false });
      } else if (lanOk) {
        set({ mode: "lan", baseUrl: lan, initializing: false });
      } else {
        set({ mode: "offline", baseUrl: null, initializing: false });
      }
    } catch {
      set({ mode: "offline", baseUrl: null, initializing: false });
    }
  },
  setUserLanUrl: (url) => {
    setStoredLan(url);
  },
  reinit: async () => {
    await get().init();
  },
  setLan: async (url) => {
    const isProd = process.env.NODE_ENV === "production";
    const candidate = url ?? getStoredLan() ?? process.env.NEXT_PUBLIC_LAN_BASE_URL ?? (isProd ? "" : "http://localhost:4000");
    if (candidate && (await tryHealth(candidate))) {
      set({ mode: "lan", baseUrl: candidate });
    } else {
      // If LAN not reachable, fall back to offline (non-destructive)
      set({ mode: "offline", baseUrl: null });
    }
  },
  setInternet: async (url) => {
    const candidate = url ?? process.env.NEXT_PUBLIC_CLOUD_BASE_URL ?? "";
    if (candidate && (await tryHealth(candidate))) {
      set({ mode: "cloud", baseUrl: candidate });
    } else {
      // If cloud not reachable, don't assume LAN; keep current or go offline
      const userLan = getStoredLan();
      const isProd = process.env.NODE_ENV === "production";
      const lan = isProd ? (userLan || process.env.NEXT_PUBLIC_LAN_BASE_URL || "") : (userLan || process.env.NEXT_PUBLIC_LAN_BASE_URL || "http://localhost:4000");
      if (lan && (await tryHealth(lan))) {
        set({ mode: "lan", baseUrl: lan });
      } else {
        set({ mode: "offline", baseUrl: null });
      }
    }
  },
  toggleInternet: async () => {
    const state = get();
    const userLan = getStoredLan();
    const isProd = process.env.NODE_ENV === "production";
    const lan = isProd ? (userLan || process.env.NEXT_PUBLIC_LAN_BASE_URL || "") : (userLan || process.env.NEXT_PUBLIC_LAN_BASE_URL || "http://localhost:4000");
    const cloud = process.env.NEXT_PUBLIC_CLOUD_BASE_URL || "";

    if (state.mode === "lan") {
      if (cloud && (await tryHealth(cloud))) {
        set({ mode: "cloud", baseUrl: cloud });
      }
      return;
    }
    if (state.mode === "cloud") {
      if (await tryHealth(lan)) {
        set({ mode: "lan", baseUrl: lan });
      }
      return;
    }
    // If offline, prefer cloud, then LAN
    if (cloud && (await tryHealth(cloud))) {
      set({ mode: "cloud", baseUrl: cloud });
    } else if (lan && (await tryHealth(lan))) {
      set({ mode: "lan", baseUrl: lan });
    }
  },
}));
