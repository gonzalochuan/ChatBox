"use client";

import type { Channel } from "@/types";
import { useChatStore } from "@/store/useChat";
import { useUI } from "@/store/useUI";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { usePeople } from "@/store/usePeople";
import { useConnection } from "@/store/useConnection";
import { SERVER_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/store/useAuth";

function formatSectionSubjectName(channel: Channel) {
  if (channel.kind !== "section-subject") return channel.name;
  const [sectionId, subjectCode] = channel.id.split("::");
  let sectionLabel: string | null = null;
  if (sectionId?.startsWith("SEC-")) {
    const sectionParts = sectionId.slice(4).split("-");
    sectionLabel = `Section ${sectionParts.join("-")}`;
  }
  if (!sectionLabel) {
    const name = channel.name?.split("•")[0]?.trim();
    sectionLabel = name || "Section";
  }
  if (!subjectCode) return sectionLabel;
  return `${sectionLabel} • ${subjectCode}`;
}

function getSectionSubjectCode(channel: Channel): string | null {
  if (channel.kind !== "section-subject") return null;
  const parts = channel.id.split("::");
  if (parts.length < 2) return null;
  const code = parts[parts.length - 1]?.trim();
  return code || null;
}

export default function ChatSidebar(): ReactElement {
  const { baseUrl } = useConnection();
  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActive = useChatStore((s) => s.setActiveChannel);
  const setChannels = useChatStore((s) => s.setChannels);
  const filter = useUI((s) => s.channelFilter);
  const messagesMap = useChatStore((s) => s.messages);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const typingByChannel = useChatStore((s) => s.typingByChannel);
  const presenceByChannel = useChatStore((s) => s.presenceByChannel);
  const createDm = useChatStore((s) => s.createDm);
  const setChannelMessages = useChatStore((s) => s.setChannelMessages);
  const setFilter = useUI((s) => s.setChannelFilter);
  const people = usePeople((s) => s.people);
  const setPeople = usePeople((s) => s.setPeople);
  const { userId, isTeacher } = useAuth();
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);


  const normalizeAvatar = useCallback((u?: string | null) => {
    if (!u) return null;
    try {
      const api = apiBase || "";
      if (u.startsWith("/")) {
        if (api) return `${api}${u}`;
        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
        return `http://${host}:4000${u}`;
      }
      if (api) {
        return u.replace("http://localhost:4000", api).replace("http://127.0.0.1:4000", api);
      }
      return u;
    } catch {
      return u;
    }
  }, [apiBase]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = people.filter((p) => p.id !== "u-me" && p.name !== "You");
    if (!q) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q) || (p.handle ?? "").toLowerCase().includes(q));
  }, [people, query]);

  const filteredGroupPeople = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    const base = people.filter((p) => p.id !== "u-me" && p.name !== "You");
    if (!q) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q) || (p.handle ?? "").toLowerCase().includes(q));
  }, [people, groupQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (filter !== "chats") return;
      setShowNewGroup(true);
    };
    window.addEventListener("chatbox:create-group", handler as any);
    return () => window.removeEventListener("chatbox:create-group", handler as any);
  }, [filter]);

  // Load recent DM conversations automatically when entering "chats" filter
  useEffect(() => {
    (async () => {
      if (filter !== "chats") return;
      const token = getToken();
      try {
        const res = await fetch(`${apiBase}/dms`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data?.dms)) return;
        // Convert each DM into a channel entry
        const dmChannels: Channel[] = data.dms.map((e: any) => ({
          id: e.channelId,
          name: e.other?.name || e.other?.email || "Direct Message",
          topic: e.other?.email || "Direct Message",
          kind: "dm",
          meta: {
            otherId: e.other?.id || null,
            otherEmail: e.other?.email || null,
            otherIsTeacher: Boolean(e.other?.isTeacher),
            avatarUrl: e.other?.avatarUrl || null,
          },
          lastActiveAt: e.lastActiveAt,
        }));
        // Merge with existing channels (preserve non-DM and avoid duplicates by id)
        const currentChannels = useChatStore.getState().channels;
        const byId: Record<string, Channel> = {};
        for (const ch of currentChannels) byId[ch.id] = ch;
        for (const ch of dmChannels) {
          if (byId[ch.id]) {
            byId[ch.id] = { ...byId[ch.id], ...ch, meta: { ...(byId[ch.id].meta || {}), ...(ch.meta || {}) } };
          } else {
            byId[ch.id] = ch;
          }
        }
        // Ensure locally created DMs (not yet on server) are kept
        for (const ch of currentChannels) {
          if (ch.kind === "dm" && !byId[ch.id]) {
            byId[ch.id] = ch;
          }
        }
        const merged = Object.values(byId);
        setChannels(merged);
      } catch {}
    })();
  }, [filter, apiBase, setChannels, mounted]);

  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
  // Load dynamic students + teachers list for DM picker when entering chats filter and opening modal
  useEffect(() => {
    (async () => {
      if (filter !== "chats" || !showNewChat) return;
      try {
        setPeopleLoading(true);
        setPeopleError(null);
        const token = getToken();
        if (!token) {
          setPeople([]);
          setPeopleLoading(false);
          return;
        }
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
        setPeople(Object.values(byId));
      } catch (e: any) {
        setPeopleError(e?.message || "Failed to load students");
      } finally {
        setPeopleLoading(false);
      }
    })();
  }, [filter, showNewChat, apiBase, setPeople]);

  // Load people list for Group creation modal
  useEffect(() => {
    (async () => {
      if (!showNewGroup || filter !== "chats") return;
      try {
        setPeopleLoading(true);
        setPeopleError(null);
        const token = getToken();
        if (!token) {
          setPeople([]);
          setPeopleLoading(false);
          return;
        }
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
        setPeople(Object.values(byId));
      } catch (e: any) {
        setPeopleError(e?.message || "Failed to load people");
      } finally {
        setPeopleLoading(false);
      }
    })();
  }, [showNewGroup, filter, apiBase, setPeople]);

  const sectionSubjectCodes = useMemo(() => {
    const codes = new Set<string>();
    channels.forEach((channel) => {
      const code = getSectionSubjectCode(channel);
      if (code) codes.add(code);
    });
    return codes;
  }, [channels]);

  const filtered = useMemo(() => {
    const list = channels.filter((c) => {
      // Messenger-style: "Chats" includes DMs and Groups
      if (filter === "chats") {
        if (
          !(c.kind === "dm" ||
            c.kind === "section-group" ||
            c.kind === "section-subject" ||
            (c.kind === "subject" && !sectionSubjectCodes.has(c.id)))
        ) {
          return false;
        }
      } else if (filter === "global") {
        if (!(c.kind === "general" || c.id === "gen" || c.name.toLowerCase() === "general")) {
          return false;
        }
      } else {
        return false;
      }

      // Search query filtering
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const name = (c.kind === "section-subject" ? formatSectionSubjectName(c) : (c.name || "")).toLowerCase();
      const topic = (c.topic || "").toLowerCase();
      return name.includes(q) || topic.includes(q);
    });

    // Sort by last active timestamp (descending)
    return list.sort((a, b) => {
      const msgsA = messagesMap[a.id] || [];
      const msgsB = messagesMap[b.id] || [];
      
      const getTs = (ch: Channel, msgs: any[]) => {
        const lastMsgTs = msgs.length > 0 ? msgs[msgs.length - 1].createdAt : 0;
        const lastActiveTs = ch.lastActiveAt ? new Date(ch.lastActiveAt).getTime() : 0;
        return Math.max(lastMsgTs, lastActiveTs);
      };

      return getTs(b, msgsB) - getTs(a, msgsA);
    });
  }, [channels, filter, sectionSubjectCodes, messagesMap, query]);

  const closeGroupModal = useCallback(() => {
    setShowNewGroup(false);
    setGroupName("");
    setSelectedGroupMembers([]);
    setGroupError(null);
    setGroupQuery("");
  }, []);

  const toggleMember = useCallback((id: string) => {
    setSelectedGroupMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const createSectionGroup = useCallback(async () => {
    try {
      if (!userId) return;
      setCreatingGroup(true);
      setGroupError(null);
      const token = getToken();
      if (!token) throw new Error("no_token");
      // eslint-disable-next-line no-console
      console.log("create_section_group_request", { apiBase, hasToken: Boolean(token), selectedCount: selectedGroupMembers.length });
      // Require at least 2 selected members so the group has 3 total (you + 2 others)
      if (selectedGroupMembers.length < 2) {
        setGroupError("Select at least 2 members.");
        return;
      }
      const res = await fetch(`${apiBase}/section-groups`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName || undefined,
          memberIds: selectedGroupMembers,
        }),
      });
      const data: any = await (async () => {
        try {
          return await res.json();
        } catch {
          try {
            const text = await res.text();
            return text ? { error: text } : {};
          } catch {
            return {};
          }
        }
      })();
      if (!res.ok) {
        const code = String(data?.error || "");
        // eslint-disable-next-line no-console
        console.error("create_section_group_failed", res.status, data);
        if (code === "members_required") throw new Error("Select at least 2 members.");
        if (code === "section_required") throw new Error("Your account has no section (year/block). Please set your section first.");
        if (code === "unauthorized") throw new Error("Unauthorized. Please log in again.");
        if (code === "group_create_failed") {
          const msg = String(data?.message || "").trim();
          throw new Error(msg ? `group_create_failed: ${msg}` : "group_create_failed");
        }
        throw new Error(code || `create_group_${res.status}`);
      }
      // Refresh channels list so group appears immediately
      const chRes = await fetch(`${apiBase}/channels`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (chRes.ok) {
        const chData = await chRes.json();
        if (Array.isArray(chData?.channels)) setChannels(chData.channels);
      }
      const newChannelId = data?.channel?.id;
      if (typeof newChannelId === "string" && newChannelId) {
        setFilter("chats");
        setActive(newChannelId);
      }
      closeGroupModal();
    } catch (e: any) {
      setGroupError(e?.message || "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  }, [apiBase, closeGroupModal, groupName, selectedGroupMembers, setActive, setChannels, setFilter, userId]);

  // When the filter changes, auto-select the first channel in that filter (Desktop only).
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return;

    if (filtered.length === 0) {
      if (activeChannelId !== null) setActive(null);
      return;
    }
    const currentInView = filtered.some((c) => c.id === activeChannelId);
    if (!currentInView) {
      // For desktop, we usually want one open. But don't force if it was explicitly cleared.
      // Actually, legacy behavior was to always have one. Let's keep for desktop.
      setActive(filtered[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, channels, filtered, activeChannelId]);

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { reinit } = useConnection();

  const handleTouchStart = (e: React.TouchEvent) => {
    if (listRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setPullDistance(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (listRef.current?.scrollTop === 0 && startY.current > 0) {
      const dist = e.touches[0].clientY - startY.current;
      if (dist > 0) {
        setPullDistance(Math.min(dist * 0.5, 120)); // Resistance
      }
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 70) {
      setIsRefreshing(true);
      setPullDistance(70);
      try {
        await reinit();
      } catch {}
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 800);
    } else {
      setPullDistance(0);
    }
    startY.current = 0;
  };

  return (
    <div className="h-full flex flex-col bg-[color:var(--background)]">
      {/* Header - adjusted for immersive top bar */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[color:var(--foreground)] tracking-tight">Chats</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowNewGroup(true)}
            className="w-10 h-10 rounded-full bg-[color:var(--surface-2)] flex items-center justify-center text-[color:var(--foreground)] hover:brightness-95 dark:hover:brightness-110 transition-colors"
            title="Create Group"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-10 h-10 rounded-full bg-[color:var(--surface-2)] flex items-center justify-center text-[color:var(--foreground)] hover:brightness-95 dark:hover:brightness-110 transition-colors"
            title="New Chat"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--muted-2)]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            placeholder="Search"
            className="w-full bg-[color:var(--surface-2)] text-[color:var(--foreground)] rounded-[20px] py-2 pl-12 pr-4 text-[15px] outline-none placeholder-[color:var(--muted-2)] font-medium transition-colors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div 
        ref={listRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto custom-scroll px-2 py-2"
        style={{ overscrollBehavior: "contain" }}
      >
        {/* Pull Indicator Area */}
        {(pullDistance > 0 || isRefreshing) && (
          <div 
            className="flex items-end justify-center gap-2 overflow-hidden transition-all duration-200"
            style={{ 
              height: `${pullDistance}px`,
              opacity: pullDistance / 70 
            }}
          >
            {[...Array(5)].map((_, i) => (
              <div 
                key={i} 
                className={`w-1.5 rounded-t-full shimmer-bone ${isRefreshing ? "animate-pulse" : ""}`}
                style={{ 
                  height: `${Math.min(24, (pullDistance / 80) * 24 * (i === 2 ? 1.5 : i % 2 ? 1.2 : 1))}px`,
                  transition: isRefreshing ? "none" : "height 0.1s ease"
                }}
              />
            ))}
          </div>
        )}

        {filtered.map((c) => {
          const isActive = activeChannelId === c.id;
          const unread = unreadCounts[c.id] || 0;
          const lastMsg = messagesMap[c.id]?.[messagesMap[c.id].length - 1];
          const isTyping = Object.keys(typingByChannel[c.id] || {}).length > 0;
          
          const isOnline = (() => {
            if (c.kind !== "dm") return false;
            const channelPresence = presenceByChannel[c.id] || {};
            const otherUserId = c.meta?.otherId as string;
            const otherPresenceTs = otherUserId ? channelPresence[otherUserId] : null;
            return otherPresenceTs ? Date.now() - otherPresenceTs < 300000 : false;
          })();

          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors ${
                isActive ? "bg-[color:var(--ring)]" : "hover:bg-[color:var(--surface-2)]"
              }`}
            >
              <div className="relative shrink-0">
                <div className="w-[56px] h-[56px] rounded-full bg-[color:var(--surface-2)] flex items-center justify-center overflow-hidden">
                  {c.meta?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={normalizeAvatar((c.meta as any)?.avatarUrl)!} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[color:var(--muted-2)]"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
                  )}
                </div>
                {/* Active Indicator */}
                {isOnline && (
                  <div className="absolute bottom-0 right-0 w-[14px] h-[14px] rounded-full bg-[#31a24c] border-2 border-[color:var(--surface)]" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-2">
                <div className="flex justify-between items-center mb-0.5">
                  <span className={`truncate text-[15px] ${unread > 0 ? "font-bold text-[color:var(--foreground)]" : "text-[color:var(--foreground)]"}`}>
                    {c.kind === "section-subject" ? formatSectionSubjectName(c) : c.name}
                  </span>
                  <span className={`text-[12px] shrink-0 ${unread > 0 ? "font-medium text-[color:var(--foreground)]" : "text-[color:var(--muted-2)]"}`}>
                    {lastMsg ? timeFmt.format(new Date(lastMsg.createdAt)) : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className={`truncate text-[13px] ${unread > 0 ? "font-bold text-[color:var(--foreground)]" : "text-[color:var(--muted)]"}`}>
                    {isTyping ? "Typing..." : (lastMsg?.text || c.topic || "Start a conversation")}
                  </span>
                  {unread > 0 && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--brand)] shrink-0" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-gray-500 text-sm">No conversations yet.</p>
          </div>
        )}
      </div>

      {/* DM Modal (Portal remains similar but styled) */}
      {mounted && showNewChat && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowNewChat(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[color:var(--foreground)]/80 font-medium">Start a direct message</div>
                <button className="text-[color:var(--foreground)]/60 hover:text-[color:var(--foreground)]" onClick={() => setShowNewChat(false)}>✕</button>
              </div>
              <div className="mb-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground)]/50">🔎</span>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search students"
                    className="w-full rounded-full border border-white/20 bg-[color:var(--surface)] text-[color:var(--foreground)] pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
              </div>
              <div className="max-h-[50vh] overflow-y-auto custom-scroll divide-y divide-white/10">
                {peopleLoading ? (
                  <div className="py-6 text-center text-white/60 text-sm">Loading…</div>
                ) : peopleError ? (
                  <div className="py-6 text-center text-red-300 text-sm">{peopleError}</div>
                ) : filteredPeople.length === 0 ? (
                  <div className="py-6 text-center text-white/60 text-sm">No students found.</div>
                ) : (
                  filteredPeople.map((p) => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        if (!userId) return;
                        const newId = createDm(userId, p.id, p.name, { 
                          otherIsTeacher: Boolean(p.isTeacher),
                          avatarUrl: p.avatarUrl || null
                        });
                        setShowNewChat(false);
                        setQuery("");
                        // Backfill history from legacy IDs so past chats appear
                        const legacyA = `dm-${p.id}`; // old scheme using otherId
                        const legacyB = `dm-${userId}`; // old scheme using myId
                        // 1) Merge any locally cached legacy messages immediately
                        try {
                          const localA = messagesMap[legacyA] || [];
                          const localB = messagesMap[legacyB] || [];
                          if ((localA.length + localB.length) > 0) {
                            const mergedMap: Record<string, any> = {};
                            for (const m of [...(messagesMap[newId] || []), ...localA, ...localB]) mergedMap[m.id] = m;
                            const merged = Object.values(mergedMap).sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
                            setChannelMessages(newId, merged as any);
                          }
                        } catch {}
                        const base = apiBase;
                        try {
                          const fetchLegacy = async (legacyId: string) => {
                            try {
                              const res = await fetch(`${base}/channels/${legacyId}/messages`);
                              if (res.ok) {
                                const data = await res.json();
                                if (Array.isArray(data?.messages) && data.messages.length > 0) {
                                  const existing = messagesMap[newId] || [];
                                  // Merge unique by id
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
                      <div className="h-9 w-9 rounded-full border border-white/20 bg-[color:var(--surface)] grid place-items-center text-[color:var(--foreground)]/70 overflow-hidden">
                        {p.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={normalizeAvatar(p.avatarUrl)!} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="9" r="3.2"/><path d="M4 20c0-3.5 4-5.5 8-5.5s8 2 8 5.5"/></svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-[color:var(--foreground)]/90 truncate">{p.name}</div>
                        {p.handle ? <div className="text-xs text-[color:var(--foreground)]/50 truncate">{p.handle}</div> : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Section Group creation modal */}
      {mounted && showNewGroup && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={closeGroupModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl p-4 text-[color:var(--foreground)]">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[color:var(--foreground)]/85 font-medium">Create a group</div>
                <button className="text-[color:var(--foreground)]/60 hover:text-[color:var(--foreground)]" onClick={closeGroupModal}>✕</button>
              </div>

              {groupError && (
                <div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{groupError}</div>
              )}

              <div className="space-y-2 mb-3">
                <label className="block text-xs text-[color:var(--foreground)]/60">Group name (optional)</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Thesis Team"
                  className="w-full rounded-xl border border-white/20 bg-[color:var(--surface)] text-[color:var(--foreground)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>

              <div className="mb-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground)]/50">🔎</span>
                  <input
                    autoFocus
                    value={groupQuery}
                    onChange={(e) => setGroupQuery(e.target.value)}
                    placeholder="Search students or teachers"
                    className="w-full rounded-full border border-white/20 bg-[color:var(--surface)] text-[color:var(--foreground)] pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
              </div>

              <div className="text-[11px] text-[color:var(--foreground)]/60 mb-2">Selected: {selectedGroupMembers.length}</div>
              <div className="max-h-[45vh] overflow-y-auto custom-scroll divide-y divide-white/10">
                {peopleLoading ? (
                  <div className="py-6 text-center text-[color:var(--foreground)]/60 text-sm">Loading…</div>
                ) : peopleError ? (
                  <div className="py-6 text-center text-red-300 text-sm">{peopleError}</div>
                ) : filteredGroupPeople.length === 0 ? (
                  <div className="py-6 text-center text-[color:var(--foreground)]/60 text-sm">No people found.</div>
                ) : (
                  filteredGroupPeople.map((p) => {
                    const checked = selectedGroupMembers.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleMember(p.id)}
                        className="w-full text-left px-3 py-3 hover:bg-white/10 flex items-center gap-3 text-[color:var(--foreground)]"
                      >
                        <div className={`h-5 w-5 rounded border grid place-items-center ${checked ? "border-emerald-400/60 bg-emerald-500/20" : "border-[color:var(--foreground)]/25 bg-[color:var(--surface)]"}`}>
                          {checked ? <span className="text-emerald-700 text-xs leading-none">✓</span> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[color:var(--foreground)]/90 truncate">{p.name}</div>
                          {p.handle ? <div className="text-xs text-[color:var(--foreground)]/50 truncate">{p.handle}</div> : null}
                        </div>
                        {Boolean((p as any).isTeacher) && (
                          <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-[2px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">Teacher</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm text-[color:var(--foreground)]"
                  onClick={closeGroupModal}
                  disabled={creatingGroup}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold tracking-wide text-white bg-gradient-to-b from-[var(--brand-2)] to-[var(--brand)] shadow-[0_14px_30px_-20px_rgba(234,88,12,0.60),0_0_0_1px_rgba(234,88,12,0.35)_inset] hover:brightness-[1.01] active:brightness-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={createSectionGroup}
                  disabled={creatingGroup}
                >
                  {creatingGroup ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
