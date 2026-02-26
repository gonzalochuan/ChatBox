"use client";

import { useUI } from "@/store/useUI";
import { useAuth } from "@/store/useAuth";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "@/store/useChat";
import { useConnection } from "@/store/useConnection";
import { clearToken } from "@/lib/auth";

const Icon = {
  profile: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
    </svg>
  ),
  globe: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18"/>
    </svg>
  ),
  dm: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H11l-4 3v-3H6a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z"/>
      <path d="M9 12h6"/>
    </svg>
  ),
  group: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="3"/>
      <circle cx="16" cy="8" r="3"/>
      <path d="M3 20c0-3 3-5 5-5m8 0c2 0 5 2 5 5"/>
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8a6 6 0 1 1 12 0v4l2 3H4l2-3V8"/>
      <path d="M9 20a3 3 0 0 0 6 0"/>
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  sun: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
    </svg>
  ),
  moon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
};

export default function LeftRail() {
  const setFilter = useUI((s) => s.setChannelFilter);
  const current = useUI((s) => s.channelFilter);
  const { avatarUrl } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const channels = useChatStore((s) => s.channels);
  const messagesMap = useChatStore((s) => s.messages);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const totalUnread = useChatStore((s) => Object.values(s.unreadCounts || {}).reduce((acc, n) => acc + (n || 0), 0));
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const { baseUrl, setUserLanUrl, reinit } = useConnection();

  const normalizedAvatarUrl = (() => {
    if (!avatarUrl) return null;
    try {
      const api = baseUrl ? baseUrl.replace(/\/$/, "") : "";
      if (avatarUrl.startsWith("/")) return api ? `${api}${avatarUrl}` : avatarUrl;
      if (api) {
        return avatarUrl
          .replace("http://localhost:4000", api)
          .replace("http://127.0.0.1:4000", api);
      }
      return avatarUrl;
    } catch {
      return avatarUrl;
    }
  })();

  // Ensure the html class matches the persisted theme on mount
  useEffect(() => {
    try {
      const pref = typeof window !== 'undefined' ? localStorage.getItem('chatbox.theme') : null;
      const el = document.documentElement;
      if (pref === 'light') {
        el.classList.add('light');
      } else {
        el.classList.remove('light');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Item = ({ children, onClick, active = false }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      className={`grid place-items-center h-10 w-10 md:h-12 md:w-12 rounded-full border bg-black/40 hover:bg-white/10 transition-colors text-white ${
        active ? "border-white/60 ring-1 ring-white/70" : "border-white/20"
      }`}
    >
      {children}
    </button>
  );

  return (
    <nav className="w-full h-full flex md:flex-col items-center md:items-center justify-between md:justify-start gap-2 md:gap-6 py-2 md:py-6 px-2 md:px-3 md:w-16">
      {/* Profile (bigger on desktop) */}
      <div className="shrink-0">
        <div className="h-10 w-10 md:h-14 md:w-14 rounded-full border border-white/20 bg-white/5 overflow-hidden">
          {normalizedAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={normalizedAvatarUrl} alt="Me" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full grid place-items-center text-white/90">
              {Icon.profile}
            </div>
          )}
        </div>
      </div>

      {/* Middle icons */}
      <div className="flex-1 flex md:flex-col items-center justify-center gap-2 md:gap-6 text-white">
        <Item onClick={() => setFilter("general")} active={current === "general"}>{Icon.globe}</Item>
        <Item onClick={() => setFilter("dm")} active={current === "dm"}>{Icon.dm}</Item>
        <Item onClick={() => setFilter("group")} active={current === "group"}>{Icon.group}</Item>
      </div>

      {/* Bottom / right icons */}
      <div className="shrink-0 flex md:flex-col items-center justify-center gap-2 md:gap-6 text-white">
        <Item onClick={() => setShowNotifs((v) => !v)}>
          <div className="relative">
            {Icon.bell}
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-emerald-500/80 border border-emerald-200/80 text-[10px] leading-[16px] text-white text-center px-[3px]">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>
        </Item>
        <Item onClick={() => setShowSettings((v) => !v)}>{Icon.settings}</Item>
      </div>

      {showNotifs && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60]" onClick={() => setShowNotifs(false)}>
              <div
                className="absolute right-3 top-[68px] md:right-6 md:top-[76px] w-[92%] md:w-96 rounded-2xl border border-white/20 bg-black/80 backdrop-blur-xl shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                  <div className="text-white/80 text-sm">Notifications</div>
                  <button
                    className="text-[11px] text-white/60 hover:text-white"
                    onClick={() => {
                      const st = useChatStore.getState();
                      st.markAllRead();
                      setShowNotifs(false);
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto custom-scroll divide-y divide-white/10">
                  {Object.entries(unreadCounts || {}).filter(([_, n]) => (n || 0) > 0).length === 0 ? (
                    <div className="py-8 text-center text-white/60 text-sm">No new notifications</div>
                  ) : (
                    Object.entries(unreadCounts || {})
                      .filter(([_, n]) => (n || 0) > 0)
                      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                      .map(([channelId, count]) => {
                        const ch = channels.find((c) => c.id === channelId);
                        const msgs = messagesMap[channelId] || [];
                        const last = msgs[msgs.length - 1];
                        const title = ch?.name || (ch?.kind === 'dm' ? 'Direct Message' : 'Channel');
                        const subtitle = last?.senderName ? `${last.senderName}: ${last.text?.slice(0, 80)}` : (ch?.topic || '');
                        const resolveFilter = () => {
                          if (ch?.kind === 'dm' || channelId.startsWith('dm-')) return 'dm' as const;
                          if (ch?.kind === 'general' || channelId === 'gen') return 'general' as const;
                          return 'group' as const;
                        };
                        return (
                          <button
                            key={channelId}
                            onClick={() => {
                              const targetFilter = resolveFilter();
                              setFilter(targetFilter);
                              setActiveChannel(channelId);
                              setShowNotifs(false);
                            }}
                            className="w-full text-left px-3 py-3 hover:bg-white/10 flex items-center gap-3"
                          >
                            <div className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white/80">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="9" r="3.2"/><path d="M4 20c0-3.5 4-5.5 8-5.5s8 2 8 5.5"/></svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="truncate text-sm text-white/90">{title}</div>
                                <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500/30 border border-emerald-300/40 text-[10px] text-emerald-200">{count as number}</span>
                              </div>
                              <div className="truncate text-xs text-white/50">{subtitle}</div>
                            </div>
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {showSettings && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60]" onClick={() => setShowSettings(false)}>
              <div
                className="absolute right-3 top-[68px] md:right-6 md:top-[76px] w-[92%] md:w-80 rounded-2xl border border-white/20 bg-black/80 backdrop-blur-xl shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                  <div className="text-white/80 text-sm">Settings</div>
                  <button className="text-[11px] text-white/60 hover:text-white" onClick={() => setShowSettings(false)}>Close</button>
                </div>
                <div className="divide-y divide-white/10">
                  <button
                    className="w-full text-left px-3 py-3 hover:bg-white/10 flex items-center gap-3"
                    onClick={() => {
                      const el = document.documentElement;
                      const isLight = el.classList.contains("light");
                      if (isLight) {
                        el.classList.remove("light");
                        try { localStorage.setItem('chatbox.theme', 'dark'); } catch {}
                      } else {
                        el.classList.add("light");
                        try { localStorage.setItem('chatbox.theme', 'light'); } catch {}
                      }
                      setShowSettings(false);
                    }}
                  >
                    <div className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white/80">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/90">Toggle theme</div>
                      <div className="text-xs text-white/50">Switch between dark and light</div>
                    </div>
                  </button>

                  <button
                    className="w-full text-left px-3 py-3 hover:bg-white/10 flex items-center gap-3"
                    onClick={() => {
                      const v = prompt("Set LAN server URL", baseUrl || "http://192.168.0.100:4000");
                      if (v) {
                        setUserLanUrl(v);
                        reinit();
                        setShowSettings(false);
                      }
                    }}
                  >
                    <div className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white/80">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 12h18"/><path d="M12 3c2.5 3 2.5 15 0 18"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/90">Set LAN server</div>
                      <div className="text-xs text-white/50">Change the backend URL for LAN mode</div>
                    </div>
                  </button>

                  <button
                    className="w-full text-left px-3 py-3 hover:bg-white/10 flex items-center gap-3"
                    onClick={() => {
                      clearToken();
                      useAuth.getState().setProfile({ id: null, email: null, name: null, nickname: null, avatarUrl: null, roles: [] });
                      setShowSettings(false);
                      window.location.href = "/login";
                    }}
                  >
                    <div className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white/80">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M10 17l-1 0c-2.2 0-4-1.8-4-4V8c0-2.2 1.8-4 4-4h1"/><path d="M15 7l5 5-5 5"/><path d="M20 12H9"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/90">Logout</div>
                      <div className="text-xs text-white/50">Sign out of your account</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </nav>
  );
}
