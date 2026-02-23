"use client";

import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import LeftRail from "@/components/LeftRail";
import { useEffect, useMemo, useRef, useState } from "react";
import AvatarPicker from "@/components/AvatarPicker";
import { useConnection } from "@/store/useConnection";
import { useChatStore } from "@/store/useChat";
import { fetchMe } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/store/useAuth";
import { useUI } from "@/store/useUI";

export default function ChatPage() {
  const { mode, baseUrl, init, initializing, setUserLanUrl, reinit } = useConnection();
  const setChannels = useChatStore((s) => s.setChannels);
  const channels = useChatStore((s) => s.channels);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const messagesMap = useChatStore((s) => s.messages);
  const setChannelMessages = useChatStore((s) => s.setChannelMessages);
  const setChannelPins = useChatStore((s) => s.setChannelPins);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const { displayName, avatarUrl, setProfile, userId, email } = useAuth() as any;
  const channelFilter = useUI((s) => s.channelFilter);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<{ name: string | null; nickname: string | null; schedule: string | null; email: string | null; studentId: string | null; avatarUrl: string | null; yearLevel?: string | null; block?: string | null } | null>(null);
  const [profileSubjects, setProfileSubjects] = useState<string[]>([]);
  const [subjectsAll, setSubjectsAll] = useState<Array<{ id: string; name?: string | null }>>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectQuery, setSubjectQuery] = useState("");
  const yearOptions = useMemo(() => ["1", "2", "3", "4"], []);
  const yearMenuRef = useRef<HTMLDivElement | null>(null);
  const [yearOpen, setYearOpen] = useState(false);
  const apiBase = useMemo(() => (baseUrl || "").replace(/\/$/, ""), [baseUrl]);
  const totalUnreadCount = useMemo(() => Object.values(unreadCounts || {}).reduce((a: number, b: number) => a + (b || 0), 0), [unreadCounts]);

  const canUseApi = useMemo(() => {
    return (mode === "lan" || mode === "cloud") && Boolean(baseUrl);
  }, [mode, baseUrl]);

  // Mobile DM picker state
  const [showMobileDm, setShowMobileDm] = useState(false);
  const [dmQuery, setDmQuery] = useState("");
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [dmPeople, setDmPeople] = useState<Array<{ id: string; name: string; handle?: string }>>([]);
  const createDm = useChatStore((s) => s.createDm);

  const lastFetchRef = useRef<Record<string, number>>({});

  // Auto-configure LAN from QR deep link: ?lan=... or #lan=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get("lan");
      const fromHash = url.hash.startsWith("#lan=") ? decodeURIComponent(url.hash.slice(5)) : null;
      const lan = fromQuery || fromHash;
      if (lan) {
        // Persist for future navigations (e.g., after login redirects)
        try {
          localStorage.setItem("chatbox.lan", lan);
          localStorage.setItem("chatbox.lanBaseUrl", lan);
        } catch {}
        setUserLanUrl(lan);
        reinit();
        return;
      }
      // If no param, try restore from storage (check both keys)
      const saved = (() => {
        try {
          return (
            localStorage.getItem("chatbox.lan") ||
            localStorage.getItem("chatbox.lanBaseUrl")
          );
        } catch {
          return null;
        }
      })();
      if (saved && saved !== baseUrl) {
        setUserLanUrl(saved);
        reinit();
      }
    } catch {}
  }, [setUserLanUrl, reinit, baseUrl]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onDown = (e: MouseEvent) => {
      if (!yearOpen) return;
      const el = yearMenuRef.current;
      if (el && !el.contains(e.target as any)) setYearOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [yearOpen]);

  // Initialize connection on mount
  useEffect(() => {
    init();
  }, [init]);

  // When LAN, fetch channels once
  useEffect(() => {
    (async () => {
      if (!canUseApi || !baseUrl) return;
      try {
        const token = getToken();
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/channels`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.channels)) setChannels(data.channels);
        }
      } catch {}
    })();
  }, [canUseApi, baseUrl, setChannels]);

  // Join ALL channels so real-time events (like call invites) arrive even when not viewing a room
  useEffect(() => {
    (async () => {
      if (!canUseApi || !baseUrl || !Array.isArray(channels) || channels.length === 0) return;
      try {
        const { joinRoom } = await import("@/lib/socket");
        for (const ch of channels) {
          if (!ch?.id) continue;
          await joinRoom(baseUrl, ch.id);
          // For symmetric DM ids (dm-<a>-<b>), join legacy variants to reach older rooms
          if (ch.id.startsWith("dm-")) {
            const parts = ch.id.split("-");
            if (parts.length === 3) {
              await joinRoom(baseUrl, `dm-${parts[1]}`);
              await joinRoom(baseUrl, `dm-${parts[2]}`);
            }
          }
        }
      } catch {}
    })();
  }, [canUseApi, baseUrl, channels]);

  // Load current user profile (if token exists) for avatar/nickname
  useEffect(() => {
    (async () => {
      if (!canUseApi || !baseUrl) return;
      try {
        const me = await fetchMe(baseUrl);
        if (me?.user) setProfile(me.user);
      } catch {}
    })();
  }, [canUseApi, baseUrl, setProfile]);

  // Always join my personal legacy DM room so I can receive DM call invites
  useEffect(() => {
    (async () => {
      if (!canUseApi || !baseUrl || !userId) return;
      try {
        const { joinRoom } = await import("@/lib/socket");
        await joinRoom(baseUrl, `dm-${userId}`);
      } catch {}
    })();
  }, [canUseApi, baseUrl, userId]);

  // Join my user room for out-of-band events like incoming call invites
  useEffect(() => {
    (async () => {
      if (!canUseApi || !baseUrl || !userId) return;
      try {
        const { joinUserRoom } = await import("@/lib/socket");
        await joinUserRoom(baseUrl, userId);
      } catch {}
    })();
  }, [canUseApi, baseUrl, userId]);

  // Open profile modal and load full profile
  const openProfile = async () => {
    if (!canUseApi || !apiBase) { setShowProfile(true); return; }
    setShowProfile(true);
    setProfileLoading(true);
    setProfileError(null);
    try {
      const { getToken } = await import("@/lib/auth");
      const token = getToken();
      if (!token) throw new Error("unauthorized");
      const res = await fetch(`${apiBase}/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`me_${res.status}`);
      const data = await res.json();
      const u = data?.user || {};
      setProfileData({ name: u.name || null, nickname: u.nickname || null, schedule: u.schedule || null, email: u.email || null, studentId: u.studentId || null, avatarUrl: u.avatarUrl || null, yearLevel: u.yearLevel || null, block: u.block || null });
      setProfileSubjects(Array.isArray(u.subjectCodes) ? u.subjectCodes : []);

      setSubjectsLoading(true);
      const subRes = await fetch(`${apiBase}/subjects`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (subRes.ok) {
        const subData = await subRes.json().catch(() => ({}));
        setSubjectsAll(Array.isArray(subData?.subjects) ? subData.subjects : []);
      } else {
        setSubjectsAll([]);
      }
    } catch (e: any) {
      setProfileError(e?.message || "Failed to load profile");
    } finally {
      setProfileLoading(false);
      setSubjectsLoading(false);
    }
  };

  // Load students for mobile DM picker when opened
  useEffect(() => {
    (async () => {
      if (!showMobileDm) return;
      try {
        setDmLoading(true);
        setDmError(null);
        const token = getToken();
        if (!token || !apiBase) { setDmPeople([]); return; }
        const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
        const [resStudents, resTeachers] = await Promise.all([
          fetch(`${apiBase}/users/students`, { headers }),
          fetch(`${apiBase}/users/teachers`, { headers }),
        ]);
        const listStudents = resStudents.ok ? (await resStudents.json())?.people ?? [] : [];
        const listTeachers = resTeachers.ok ? (await resTeachers.json())?.people ?? [] : [];
        const byId: Record<string, any> = {};
        for (const p of Array.isArray(listStudents) ? listStudents : []) {
          if (p && p.id) byId[p.id] = { ...p, isTeacher: Boolean(p?.isTeacher) };
        }
        for (const p of Array.isArray(listTeachers) ? listTeachers : []) {
          if (p && p.id) byId[p.id] = { ...p, isTeacher: true };
        }
        setDmPeople(Object.values(byId));
      } catch (e: any) {
        setDmError(e?.message || "Failed to load students");
      } finally {
        setDmLoading(false);
      }
    })();
  }, [showMobileDm, apiBase]);

  const activeIsDm = useMemo(() => {
    const ch = channels.find(c => c.id === activeChannelId);
    return ch?.kind === 'dm';
  }, [channels, activeChannelId]);

  const activeIsGroup = useMemo(() => {
    const ch = channels.find(c => c.id === activeChannelId);
    return ch?.kind === 'section-group' || ch?.kind === 'section-subject' || ch?.kind === 'subject' || ch?.kind === 'section';
  }, [channels, activeChannelId]);

  // Join room and fetch messages when channel changes in LAN mode
  useEffect(() => {
    (async () => {
      if (!canUseApi || !baseUrl || !activeChannelId) return;

      // If we already have messages locally, show them immediately and refresh in background.
      // Avoid hammering the API when users click around quickly.
      const now = Date.now();
      const last = lastFetchRef.current[activeChannelId] || 0;
      if (now - last < 1500) {
        return;
      }
      lastFetchRef.current[activeChannelId] = now;

      // Migrate legacy DM id (dm-<otherId>) to symmetric id (dm-<low>-<high>) so history is unified
      if (activeChannelId.startsWith("dm-") && userId) {
        const rest = activeChannelId.slice(3);
        if (!rest.includes("-")) {
          const otherId = rest;
          const [lo, hi] = userId < otherId ? [userId, otherId] : [otherId, userId];
          const newId = `dm-${lo}-${hi}`;
          if (newId !== activeChannelId) {
            // Merge any local messages and switch active channel
            try {
              const existingNew = messagesMap[newId] || [];
              const existingOld = messagesMap[activeChannelId] || [];
              const mergedMap: Record<string, any> = {};
              for (const m of [...existingNew, ...existingOld]) mergedMap[m.id] = m;
              const merged = Object.values(mergedMap).sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
              if (merged.length > 0) setChannelMessages(newId, merged as any);
            } catch {}
            setActiveChannel(newId);
            return; // wait for next effect run with newId
          }
        }
      }
      // Join room (non-blocking). Message fetch should not wait for socket join.
      try {
        const { joinRoom } = await import("@/lib/socket");
        joinRoom(baseUrl, activeChannelId);
      } catch {}
      try {
        const token = getToken();
        const res = await fetch(
          `${baseUrl.replace(/\/$/, "")}/channels/${activeChannelId}/messages`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages))
            setChannelMessages(activeChannelId, data.messages);
          if (Array.isArray(data.pins)) setChannelPins(activeChannelId, data.pins);
        }
      } catch {}
    })();
  }, [canUseApi, baseUrl, activeChannelId, setChannelMessages, setChannelPins, userId, messagesMap, setActiveChannel]);

  const badge = (
    <span
      className={`text-xs px-2 py-1 rounded-full border ${
        mode === "lan"
          ? "bg-green-50 text-green-700 border-green-200"
          : mode === "cloud"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-gray-100 text-gray-600 border-gray-200"
      }`}
    >
      {initializing ? "Connecting…" : mode.toUpperCase()}
    </span>
  );

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      {/* Grid background only; keep default strength from CSS */}
      <div className="grid-layer" />

      {/* App shell */}
      <div className="relative z-10 h-dvh grid grid-rows-[64px_1fr] min-h-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button onClick={openProfile} title="View profile" className="h-8 w-8 rounded-full overflow-hidden border border-white/20 bg-white/10">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Me" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-white/60">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="9" r="3.2"/><path d="M4 20c0-3.5 4-5.5 8-5.5s8 2 8 5.5"/></svg>
                </div>
              )}
            </button>
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">CB</div>
          </div>
          <div className="flex items-center gap-3 text-xs md:text-sm text-white/70">
            {badge}
          </div>
        </header>

        {/* 3-box responsive layout */}
        <div className="grid grid-cols-12 gap-2 md:gap-4 h-full p-2 md:p-4 min-h-0">
          {/* Left rail (horizontal pill on mobile, vertical pill on desktop) */}
          <div className="col-span-12 md:col-span-1 xl:col-span-1 min-h-0">
            <div className="h-14 md:h-full rounded-full md:rounded-[28px] border border-white/15 bg-black/40 backdrop-blur-sm shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] overflow-hidden flex items-center justify-center">
              <LeftRail />
            </div>
          </div>

          {/* Messages list card (hidden on mobile when a chat is open) */}
          <aside className={`col-span-12 md:col-span-4 lg:col-span-3 xl:col-span-3 min-h-0 ${activeChannelId ? "hidden md:block" : "block"}`}>
            <div className="h-full rounded-3xl border border-white/15 bg-black/40 backdrop-blur-sm shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] overflow-hidden flex flex-col min-h-0">
              <ChatSidebar />
            </div>
          </aside>

          {/* Chat window card (shown on mobile only when a chat is open) */}
          <main className={`${activeChannelId ? "col-span-12" : "hidden"} md:block md:col-span-7 lg:col-span-8 xl:col-span-8 min-h-0`}>
            <div className="h-full rounded-[28px] border border-white/15 bg-black/40 backdrop-blur-sm shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] overflow-hidden flex flex-col min-h-0">
              <ChatWindow />
            </div>
          </main>
        </div>
      </div>

      {/* Mobile-only floating DM add button when in DM view */}
      {(channelFilter === 'dm' || activeIsDm) && (
        <>
          <button
            className="fixed md:hidden z-50 bottom-20 right-4 h-12 w-12 rounded-full bg-white/10 border border-white/20 text-white text-2xl grid place-items-center shadow-lg backdrop-blur-sm"
            title="New chat"
            onClick={() => setShowMobileDm(true)}
          >
            ＋
          </button>
          <button
            className="fixed md:hidden z-50 bottom-36 right-4 h-12 w-12 rounded-full bg-white/10 border border-white/20 text-white text-xl grid place-items-center shadow-lg backdrop-blur-sm"
            title="Menu"
            onClick={() => setShowMobileDm(true)}
          >
            ☰
          </button>
        </>
      )}

      {/* Mobile-only floating Group add button when in Group view */}
      {channelFilter === 'group' && !activeIsDm && (
        <button
          className="fixed md:hidden z-50 bottom-20 right-4 h-12 w-12 rounded-full bg-white/10 border border-white/20 text-white text-2xl grid place-items-center shadow-lg backdrop-blur-sm"
          title="Create group"
          onClick={() => {
            try {
              window.dispatchEvent(new CustomEvent('chatbox:create-group'));
            } catch {}
          }}
        >
          ＋
        </button>
      )}

      {showProfile && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowProfile(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg max-h-[85vh] rounded-2xl border border-white/20 bg-black/70 backdrop-blur-xl p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white/80 font-medium">My Profile</div>
                <button className="text-white/60 hover:text-white" onClick={() => setShowProfile(false)}>✕</button>
              </div>
              {profileError && <div className="mb-2 text-sm text-red-300">{profileError}</div>}
              {profileLoading ? (
                <div className="py-10 text-center text-white/70 text-sm">Loading…</div>
              ) : (
                <div className="space-y-5 overflow-y-auto custom-scroll pr-1" style={{ maxHeight: "calc(85vh - 120px)" }}>
                  <div>
                    <AvatarPicker
                      value={profileData?.avatarUrl || null}
                      onChange={(url) => setProfileData((p) => ({ ...(p || { name: null, nickname: null, schedule: null, email: null, studentId: null, avatarUrl: null }), avatarUrl: url }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Name</label>
                      <input
                        className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                        value={profileData?.name ?? ""}
                        onChange={(e) => setProfileData((p) => ({ ...(p || { name: null, nickname: null, schedule: null, email: null, studentId: null, avatarUrl: null }), name: e.target.value }))}
                        placeholder="Your full name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Nickname</label>
                      <input
                        className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                        value={profileData?.nickname ?? ""}
                        onChange={(e) => setProfileData((p) => ({ ...(p || { name: null, nickname: null, schedule: null, email: null, studentId: null, avatarUrl: null }), nickname: e.target.value }))}
                        placeholder="Display name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Schedule</label>
                      <input
                        className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                        value={profileData?.schedule ?? ""}
                        onChange={(e) => setProfileData((p) => ({ ...(p || { name: null, nickname: null, schedule: null, email: null, studentId: null, avatarUrl: null }), schedule: e.target.value }))}
                        placeholder="e.g. MWF 8-10am"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Email</label>
                      <input
                        className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none opacity-70"
                        value={profileData?.email ?? ""}
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Student ID</label>
                      <input
                        className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none opacity-70"
                        value={profileData?.studentId ?? ""}
                        readOnly
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">Year level</label>
                      <div className="relative mt-1" ref={yearMenuRef}>
                        <button
                          type="button"
                          onClick={() => setYearOpen((v) => !v)}
                          className="w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-left text-white/90 outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                        >
                          <span>{profileData?.yearLevel ? `Year ${profileData.yearLevel}` : "(none)"}</span>
                          <span className="text-white/70">▾</span>
                        </button>
                        {yearOpen && (
                          <div className="absolute z-40 mt-2 w-full rounded-xl border border-white/20 bg-black/60 backdrop-blur-xl shadow-xl overflow-hidden">
                            <button
                              type="button"
                              onClick={() => { setProfileData((p) => ({ ...(p || { name: null, nickname: null, schedule: null, email: null, studentId: null, avatarUrl: null }), yearLevel: null })); setYearOpen(false); }}
                              className={`w-full text-left px-3 py-2 hover:bg-white/10 ${!profileData?.yearLevel ? "bg-white/10" : ""}`}
                            >
                              (none)
                            </button>
                            {yearOptions.map((y) => (
                              <button
                                key={y}
                                type="button"
                                onClick={() => { setProfileData((p) => ({ ...(p || { name: null, nickname: null, schedule: null, email: null, studentId: null, avatarUrl: null }), yearLevel: y })); setYearOpen(false); }}
                                className={`w-full text-left px-3 py-2 hover:bg-white/10 ${String(profileData?.yearLevel || "") === y ? "bg-white/10" : ""}`}
                              >
                                Year {y}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Block</label>
                      <input
                        className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                        value={String(profileData?.block ?? "")}
                        onChange={(e) => setProfileData((p) => ({ ...(p || { name: null, nickname: null, schedule: null, email: null, studentId: null, avatarUrl: null }), block: e.target.value }))}
                        placeholder="e.g. B4"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">Subjects</label>
                      <div className="rounded-xl border border-white/20 bg-black/30 p-3">
                        {subjectsLoading ? (
                          <div className="text-sm text-white/60">Loading…</div>
                        ) : subjectsAll.length === 0 ? (
                          <div className="text-sm text-white/60">No subjects available.</div>
                        ) : (
                          <div className="space-y-3">
                            <input
                              value={subjectQuery}
                              onChange={(e) => setSubjectQuery(e.target.value)}
                              placeholder="Search subjects"
                              className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                            />

                            {profileSubjects.length > 0 ? (
                              <div>
                                <div className="text-[11px] text-white/60 mb-1">Selected</div>
                                <div className="flex flex-wrap gap-2">
                                  {profileSubjects
                                    .slice()
                                    .sort((a, b) => a.localeCompare(b))
                                    .map((id) => (
                                      <button
                                        key={id}
                                        type="button"
                                        onClick={() => setProfileSubjects((prev) => prev.filter((x) => x !== id))}
                                        className="text-[11px] px-2 py-1 rounded-full border border-emerald-300/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                                        title="Tap to remove"
                                      >
                                        {id}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            ) : null}

                            <div className="max-h-[180px] overflow-y-auto custom-scroll flex flex-wrap gap-2">
                              {subjectsAll
                                .filter((s) => {
                                  const q = subjectQuery.trim().toLowerCase();
                                  if (!q) return true;
                                  return String(s.id).toLowerCase().includes(q) || String(s.name || "").toLowerCase().includes(q);
                                })
                                .map((s) => {
                              const active = profileSubjects.includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    setProfileSubjects((prev) => {
                                      const set = new Set(prev);
                                      if (active) set.delete(s.id);
                                      else set.add(s.id);
                                      return Array.from(set);
                                    });
                                  }}
                                  className={`text-[11px] px-2 py-1 rounded-full border ${active ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100" : "border-white/25 bg-white/10 text-white/80 hover:bg-white/15"}`}
                                  title={s.name ? `${s.id} — ${s.name}` : s.id}
                                >
                                  {s.id}
                                </button>
                              );
                            })}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-white/50">Changing year/block/subjects will update your channel access.</div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm" onClick={() => setShowProfile(false)}>Close</button>
                    <button
                      className="rounded-xl border border-emerald-300/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-2 text-sm"
                      onClick={async () => {
                        try {
                          if (!apiBase) return;
                          const { getToken } = await import("@/lib/auth");
                          const token = getToken();
                          if (!token) return;
                          const res = await fetch(`${apiBase}/me`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({
                              name: profileData?.name ?? null,
                              nickname: profileData?.nickname ?? null,
                              schedule: profileData?.schedule ?? null,
                              avatarUrl: profileData?.avatarUrl ?? null,
                              yearLevel: (profileData as any)?.yearLevel ?? null,
                              block: (profileData as any)?.block ?? null,
                              subjectCodes: profileSubjects,
                            }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            if (data?.user) setProfile(data.user);
                            // Refresh channels so new section/subjects apply immediately
                            try {
                              const chRes = await fetch(`${apiBase}/channels`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
                              if (chRes.ok) {
                                const chData = await chRes.json().catch(() => ({}));
                                if (Array.isArray(chData?.channels)) setChannels(chData.channels);
                              }
                            } catch {}
                            setShowProfile(false);
                          }
                        } catch {}
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile DM picker modal */}
      {showMobileDm && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowMobileDm(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-black/70 backdrop-blur-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white/80 font-medium">Start a direct message</div>
                <button className="text-white/60 hover:text-white" onClick={() => setShowMobileDm(false)}>✕</button>
              </div>
              <div className="mb-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">🔎</span>
                  <input
                    autoFocus
                    value={dmQuery}
                    onChange={(e) => setDmQuery(e.target.value)}
                    placeholder="Search students"
                    className="w-full rounded-full border border-white/20 bg-black/30 text-white/90 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto custom-scroll divide-y divide-white/10">
                {dmLoading ? (
                  <div className="py-6 text-center text-white/60 text-sm">Loading…</div>
                ) : dmError ? (
                  <div className="py-6 text-center text-red-300 text-sm">{dmError}</div>
                ) : (
                  dmPeople
                    .filter((p) => {
                      const q = dmQuery.trim().toLowerCase();
                      if (!q) return true;
                      return p.name.toLowerCase().includes(q) || (p.handle || '').toLowerCase().includes(q);
                    })
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={async () => {
                          if (!userId) return;
                          const newId = createDm(userId, p.id, p.name);
                          setShowMobileDm(false);
                          setDmQuery("");
                          // Attempt legacy backfill similar to sidebar
                          try {
                            const legacyA = `dm-${p.id}`;
                            const legacyB = `dm-${userId}`;
                            const base = apiBase;
                            const fetchLegacy = async (legacyId: string) => {
                              try {
                                const res = await fetch(`${base}/channels/${legacyId}/messages`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined });
                                if (res.ok) {
                                  const data = await res.json();
                                  if (Array.isArray(data?.messages) && data.messages.length > 0) {
                                    const existing = messagesMap[newId] || [];
                                    const mergedMap: Record<string, any> = {};
                                    for (const m of [...existing, ...data.messages]) mergedMap[m.id] = m;
                                    const merged = Object.values(mergedMap).sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
                                    setChannelMessages(newId, merged as any);
                                  }
                                }
                              } catch {}
                            };
                            await Promise.all([fetchLegacy(legacyA), fetchLegacy(legacyB)]);
                          } catch {}
                        }}
                        className="w-full text-left px-3 py-3 hover:bg-white/10 flex items-center gap-3"
                      >
                        <div className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white/80">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="9" r="3.2"/><path d="M4 20c0-3.5 4-5.5 8-5.5s8 2 8 5.5"/></svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm text-white/90 truncate">{p.name}</div>
                          {p.handle ? <div className="text-xs text-white/50 truncate">{p.handle}</div> : null}
                        </div>
                      </button>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
