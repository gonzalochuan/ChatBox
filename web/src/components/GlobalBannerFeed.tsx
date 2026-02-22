"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { SERVER_URL } from "@/lib/config";
import { useConnection } from "@/store/useConnection";
import type { Banner, BannerKind } from "@/types";
import { getSocket } from "@/lib/socket";
import { getToken } from "@/lib/auth";

const KIND_STYLES: Record<BannerKind, { badge: string; card: string }> = {
  info: {
    badge: "border-white/30 bg-white/10 text-white/80",
    card: "border-white/30 bg-white/10 text-white",
  },
  success: {
    badge: "border-green-400/50 bg-green-500/10 text-green-200",
    card: "border-green-400/30 bg-green-500/10 text-green-100",
  },
  error: {
    badge: "border-red-400/50 bg-red-500/10 text-red-200",
    card: "border-red-400/30 bg-red-500/10 text-red-100",
  },
};

export default function GlobalBannerFeed() {
  const { baseUrl } = useConnection();
  const pathname = usePathname();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);

  const hiddenOnRoute = useMemo(() => {
    const p = (pathname || "").toLowerCase();
    return p === "/" || p === "/login" || p === "/register";
  }, [pathname]);

  const fetchBanners = useCallback(async () => {
    try {
      const token = getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/banners`, { cache: "no-store", headers });
      if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
      const data = await res.json();
      setBanners(Array.isArray(data?.banners) ? data.banners : []);
      setLoaded(true);
    } catch {
      setBanners([]);
      setLoaded(true);
    }
  }, [apiBase]);

  useEffect(() => {
    if (hiddenOnRoute) {
      setBanners([]);
      setLoaded(true);
      return;
    }
    let disposed = false;
    const runner = async () => {
      if (!disposed) await fetchBanners();
    };
    runner();
    const interval = setInterval(fetchBanners, 30000);
    const handleFocus = () => fetchBanners();
    window.addEventListener("focus", handleFocus);
    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchBanners, hiddenOnRoute]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (hiddenOnRoute) return;
    let unsub = () => {};
    (async () => {
      try {
        const socket = await getSocket(apiBase);
        const handler = () => fetchBanners();
        socket.on("banner:update", handler);
        unsub = () => {
          try {
            socket.off("banner:update", handler);
          } catch {
            /* noop */
          }
        };
      } catch {
        unsub = () => {};
      }
    })();
    return () => {
      unsub();
    };
  }, [apiBase, fetchBanners, hiddenOnRoute]);

  if (hiddenOnRoute) return null;

  if (!loaded && banners.length === 0) return null;
  if (banners.length === 0) {
    return <div className="h-0" aria-hidden="true" />;
  }

  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-[120] flex flex-col items-center gap-3 px-3 sm:px-4 py-4">
      {banners.map((banner) => {
        const styles = KIND_STYLES[banner.kind] ?? KIND_STYLES.info;
        const isCollapsed = collapsed[banner.id] ?? false;
        return (
          <div
            key={banner.id}
            className={`pointer-events-auto w-full max-w-full sm:max-w-5xl rounded-3xl border px-4 sm:px-6 ${isCollapsed ? "py-2 sm:py-3" : "py-3 sm:py-4"} shadow-[0_10px_45px_-14px_rgba(0,0,0,0.75)] backdrop-blur-2xl transition-transform duration-200 hover:-translate-y-0.5 ${styles.card}`}
          >
            <div className="flex flex-col gap-2 sm:gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-0.5 text-[10px] sm:text-[11px] uppercase tracking-[0.18em] sm:tracking-[0.28em] ${styles.badge}`}>
                    {banner.kind}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [banner.id]: !isCollapsed }))}
                    className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/70 hover:bg-white/10"
                  >
                    {isCollapsed ? "Show" : "Hide"}
                  </button>
                </div>
                <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.28em] text-white/55">
                  Live update • {now.toLocaleString()}
                </div>
              </div>
              {!isCollapsed && (
                <>
                  <div className="space-y-2">
                    <div className="text-lg sm:text-[28px] font-semibold tracking-wide text-white">
                      {banner.title}
                    </div>
                    <div className="text-sm sm:text-base leading-relaxed text-white/85 whitespace-pre-wrap break-words">
                      {banner.message}
                    </div>
                  </div>
                  <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.3em] text-white/45">
                    {formatWindow(banner.startsAt, banner.endsAt)}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <div className="h-[16px]" aria-hidden="true" />
    </div>
  );
}

function formatWindow(startsAt?: string | null, endsAt?: string | null) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const startValid = start && !Number.isNaN(start.getTime());
  const endValid = end && !Number.isNaN(end.getTime());

  const rangeFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (!startValid && !endValid) {
    return "Active until further notice";
  }
  if (startValid && !endValid) {
    return `Effective ${rangeFmt.format(start!)}`;
  }
  if (!startValid && endValid) {
    return `Ends ${rangeFmt.format(end!)}`;
  }
  if (start && end) {
    return `${rangeFmt.format(start)} — ${rangeFmt.format(end)}`;
  }
  return "";
}
