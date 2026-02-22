"use client";

import type { Channel } from "@/types";
import { useChatStore } from "@/store/useChat";
import { useUI } from "@/store/useUI";
import { useCallback, useEffect, useMemo, useState } from "react";
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
      if (filter !== "group") return;
      setShowNewGroup(true);
    };
    window.addEventListener("chatbox:create-group", handler as any);
    return () => window.removeEventListener("chatbox:create-group", handler as any);
  }, [filter]);

  // Load recent DM conversations automatically when entering DM filter
  useEffect(() => {
    (async () => {
      if (filter !== "dm") return;
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
          },
        }));
        // Merge with existing channels (preserve non-DM and avoid duplicates by id)
        const byId: Record<string, Channel> = {};
        for (const ch of channels) byId[ch.id] = ch;
        for (const ch of dmChannels) {
          if (byId[ch.id]) {
            byId[ch.id] = { ...byId[ch.id], ...ch, meta: { ...(byId[ch.id].meta || {}), ...(ch.meta || {}) } };
          } else {
            byId[ch.id] = ch;
          }
        }
        const merged = Object.values(byId);
        let changed = merged.length !== channels.length;
        if (!changed) {
          for (let i = 0; i < merged.length; i += 1) {
            const m = merged[i];
            const existing = channels.find((c) => c.id === m.id);
            if (!existing) {
              changed = true;
              break;
            }
            const sameName = existing.name === m.name;
            const sameTopic = (existing.topic || "") === (m.topic || "");
            const sameKind = existing.kind === m.kind;
            const sameMeta = JSON.stringify(existing.meta || {}) === JSON.stringify(m.meta || {});
            if (!(sameName && sameTopic && sameKind && sameMeta)) {
              changed = true;
              break;
            }
          }
        }
        if (changed) setChannels(merged);
      } catch {}
    })();
  }, [filter, apiBase, channels, setChannels]);

  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Load dynamic students + teachers list for DM picker when entering DM filter and opening modal
  useEffect(() => {
    (async () => {
      if (filter !== "dm" || !showNewChat) return;
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

  // Load people list for Group creation modal (independent from DM)
  useEffect(() => {
    (async () => {
      if (!showNewGroup || filter !== "group") return;
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
    return channels.filter((c) => {
      if (filter === "general") {
        return c.kind === "general" || c.id === "gen" || c.name.toLowerCase() === "general";
      }
      if (filter === "dm") {
        return c.kind === "dm";
      }
      if (filter === "group") {
        if (c.kind === "section-subject") return true;
        if (c.kind === "section-group") return true;
        const name = (c.name || "").trim();
        const isNumeric = /^[0-9]+$/.test(name);
        if (c.kind === "subject" && !isNumeric) {
          if (sectionSubjectCodes.has(c.id)) return false;
          return true;
        }
        return false;
      }
      return false;
    });
  }, [channels, filter, sectionSubjectCodes]);

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
        setFilter("group");
        setActive(newChannelId);
      }
      closeGroupModal();
    } catch (e: any) {
      setGroupError(e?.message || "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  }, [apiBase, closeGroupModal, groupName, selectedGroupMembers, setActive, setChannels, setFilter, userId]);

  // When the filter changes, auto-select the first channel in that filter.
  useEffect(() => {
    if (filtered.length === 0) {
      if (activeChannelId !== null) setActive(null);
      return;
    }
    const currentInView = filtered.some((c) => c.id === activeChannelId);
    if (!currentInView) {
      setActive(filtered[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, channels, filtered, activeChannelId]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm md:text-base tracking-wide text-white/80">Messages</h2>
          {isTeacher && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-emerald-200">
              Teacher
            </span>
          )}
        </div>
        {filter === "dm" && (
          <div className="flex items-center gap-2">
            <button
              title="New chat"
              className="h-8 w-8 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 grid place-items-center"
              onClick={() => { console.log("New chat"); setShowNewChat(true); }}
            >
              ＋
            </button>
          </div>
        )}
        {filter === "group" && (
          <div className="flex items-center gap-2">
            <button
              title="Create group"
              className="h-8 w-8 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 grid place-items-center"
              onClick={() => setShowNewGroup(true)}
            >
              ＋
            </button>
          </div>
        )}
      </div>

      {/* Tools */}
      {filter === "dm" && (
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">🔎</span>
            <input
              placeholder="Search"
              className="w-full rounded-full border border-white/20 bg-black/30 text-white/90 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scroll px-3 py-3 space-y-2">
        {filtered.map((c) => {
          const meta = (c.meta || {}) as Record<string, unknown>;
          const otherIsTeacher = Boolean(meta.otherIsTeacher);
          return (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`w-full text-left rounded-2xl border border-white/15 px-3 py-3 bg-black/30 hover:bg-white/10 transition-colors flex items-center gap-3 ${
              activeChannelId === c.id ? "ring-1 ring-white/30" : ""
            }`}
          >
            <div className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white/80 shrink-0">
              {/* simple avatar glyph */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="9" r="3.2"/><path d="M4 20c0-3.5 4-5.5 8-5.5s8 2 8 5.5"/></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="truncate text-sm font-medium tracking-wide">
                    {c.kind === "section-subject" ? formatSectionSubjectName(c) : c.name}
                  </span>
                  {c.kind === "dm" && otherIsTeacher && (
                    <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-[2px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">
                      Teacher
                    </span>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {/* Unread badge */}
                  {unreadCounts[c.id] > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500/30 border border-emerald-300/40 text-[10px] text-emerald-200">
                      {unreadCounts[c.id]}
                    </span>
                  )}
                  <div className="text-[10px] text-white/50">
                    {mounted && messagesMap[c.id]?.length ? timeFmt.format(new Date(messagesMap[c.id][messagesMap[c.id].length-1].createdAt)) : ""}
                  </div>
                </div>
              </div>
              <div className="truncate text-xs text-white/50">
                {c.kind === "dm" && Object.keys(typingByChannel[c.id] || {}).length > 0
                  ? "Typing…"
                  : c.kind === "section-group"
                    ? "Group"
                    : (c.topic || "")}
              </div>
            </div>
          </button>
        );
        })}
        {channels.length === 0 && (
          <div className="p-4 text-sm text-white/50">No channels yet.</div>
        )}
      </div>
      {/* DM people picker modal */}
      {mounted && showNewChat && filter === "dm" && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowNewChat(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-black/70 backdrop-blur-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white/80 font-medium">Start a direct message</div>
                <button className="text-white/60 hover:text-white" onClick={() => setShowNewChat(false)}>✕</button>
              </div>
              <div className="mb-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">🔎</span>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search students"
                    className="w-full rounded-full border border-white/20 bg-black/30 text-white/90 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
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
                        const newId = createDm(userId, p.id, p.name, { otherIsTeacher: Boolean(p.isTeacher) });
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
        </div>,
        document.body
      )}

      {/* Section Group creation modal */}
      {mounted && showNewGroup && filter === "group" && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={closeGroupModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-black/70 backdrop-blur-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white/80 font-medium">Create a group</div>
                <button className="text-white/60 hover:text-white" onClick={closeGroupModal}>✕</button>
              </div>

              {groupError && (
                <div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{groupError}</div>
              )}

              <div className="space-y-2 mb-3">
                <label className="block text-xs text-white/60">Group name (optional)</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Thesis Team"
                  className="w-full rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>

              <div className="mb-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">🔎</span>
                  <input
                    autoFocus
                    value={groupQuery}
                    onChange={(e) => setGroupQuery(e.target.value)}
                    placeholder="Search students or teachers"
                    className="w-full rounded-full border border-white/20 bg-black/30 text-white/90 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
              </div>

              <div className="text-[11px] text-white/60 mb-2">Selected: {selectedGroupMembers.length}</div>
              <div className="max-h-[45vh] overflow-y-auto custom-scroll divide-y divide-white/10">
                {peopleLoading ? (
                  <div className="py-6 text-center text-white/60 text-sm">Loading…</div>
                ) : peopleError ? (
                  <div className="py-6 text-center text-red-300 text-sm">{peopleError}</div>
                ) : filteredGroupPeople.length === 0 ? (
                  <div className="py-6 text-center text-white/60 text-sm">No people found.</div>
                ) : (
                  filteredGroupPeople.map((p) => {
                    const checked = selectedGroupMembers.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleMember(p.id)}
                        className="w-full text-left px-3 py-3 hover:bg-white/10 flex items-center gap-3"
                      >
                        <div className={`h-5 w-5 rounded border grid place-items-center ${checked ? "border-emerald-300/60 bg-emerald-500/20" : "border-white/20 bg-white/5"}`}>
                          {checked ? <span className="text-emerald-200 text-xs leading-none">✓</span> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white/90 truncate">{p.name}</div>
                          {p.handle ? <div className="text-xs text-white/50 truncate">{p.handle}</div> : null}
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
                  className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm"
                  onClick={closeGroupModal}
                  disabled={creatingGroup}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-4 py-2 text-sm"
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
