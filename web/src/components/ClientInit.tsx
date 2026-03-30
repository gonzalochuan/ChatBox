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

      // 1) Re-init on Focus (Auto-Wake-Up) & Notification Permission
      const handleVisibility = () => {
        if (document.visibilityState === "visible") {
          reinit();
          // Request permission for system-level notifications (Required for Android Bubbles)
          if ("Notification" in window && Notification.permission === "default") {
             Notification.requestPermission();
          }
        }
      };
      w.addEventListener("visibilitychange", handleVisibility);
      
      // Initial permission request on mount
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }

      // 2) Self-Healing Pulse (Recover from Offline)
      // We use a much faster pulse (5s) for the first minute of app launch
      const startTime = Date.now();
      const interval = setInterval(() => {
        const { mode } = useConnection.getState();
        if (mode === "offline") {
          const elapsed = Date.now() - startTime;
          const pulseRate = elapsed < 60000 ? 5000 : 30000;
          // Only trigger if we are on the 'long' cycle or in the 'fast' initial window
          if (elapsed < 60000 || (elapsed % 30000 < 5000)) {
            reinit();
          }
        }
      }, 5000); // Check every 5 seconds to see if we need to pulse

      // 3) Check URL (?lan=... or #lan=...)
      let lan: string | null = null;
      try {
        const url = new URL(w.location.href);
        const fromQuery = url.searchParams.get("lan");
        const fromHash = url.hash.startsWith("#lan=") ? decodeURIComponent(url.hash.slice(5)) : null;
        lan = fromQuery || fromHash;
      } catch {}

      // 4) If not in URL, restore from storage
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
