"use client";

import { useEffect } from "react";
import { useConnection } from "@/store/useConnection";

export default function ClientInit() {
  const { setUserLanUrl, reinit, baseUrl, init } = useConnection();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    try {
      const w = typeof window !== "undefined" ? window : undefined;
      if (!w) return;

      // 1) Re-init on Focus (Auto-Wake-Up)
      const handleVisibility = () => {
        if (document.visibilityState === "visible") {
          reinit();
        }
      };
      w.addEventListener("visibilitychange", handleVisibility);

      // 2) Self-Healing Pulse (Recover from Offline)
      const interval = setInterval(() => {
        const { mode } = useConnection.getState();
        if (mode === "offline") {
          reinit();
        }
      }, 30000); // Check every 30 seconds if offline

      // 3) Check URL (?lan=... or #lan=...)
      let lan: string | null = null;
      try {
        const url = new URL(w.location.href);
        const fromQuery = url.searchParams.get("lan");
        const fromHash = url.hash.startsWith("#lan=") ? decodeURIComponent(url.hash.slice(5)) : null;
        lan = fromQuery || fromHash;
      } catch {}

      // 2) If not in URL, restore from storage
      if (!lan) {
        try {
          lan = (localStorage.getItem("chatbox.lan") || localStorage.getItem("chatbox.lanBaseUrl") || null);
        } catch {}
      }

      if (lan && lan !== baseUrl) {
        try {
          localStorage.setItem("chatbox.lan", lan);
          localStorage.setItem("chatbox.lanBaseUrl", lan);
        } catch {}
        setUserLanUrl(lan);
        // Re-run connection init to switch to LAN
        reinit();
      }

      return () => {
        w.removeEventListener("visibilitychange", handleVisibility);
        clearInterval(interval);
      };
    } catch {}
  }, [setUserLanUrl, reinit, baseUrl]);

  return null;
}
