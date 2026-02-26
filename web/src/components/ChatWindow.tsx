"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageContext } from "@/types";
// Video/voice calls use built-in WebRTC with Socket.IO signaling
import { useAuth } from "@/store/useAuth";
import { useChatStore } from "@/store/useChat";
import { useConnection } from "@/store/useConnection";
import { getToken } from "@/lib/auth";

function formatBytesReadable(size?: number) {
  if (!size || !Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function SmartContextCard({ context, align }: { context: MessageContext; align: "left" | "right" }) {
  const highlights = Array.isArray(context.highlights) ? context.highlights.filter(Boolean) : [];
  const suggestions = Array.isArray(context.suggestions) ? context.suggestions.filter(Boolean) : [];
  const meta = context.meta || { filename: "attachment", size: 0, mimetype: "" };
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div className="mt-2 max-w-[80%] rounded-2xl border border-emerald-300/30 bg-emerald-900/20 px-4 py-3 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.13)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80 mb-2">
          Smart Contextual Messaging
        </div>
        <div className="text-sm text-emerald-50/90 whitespace-pre-wrap break-words">
          {context.summary || `${meta.filename} was shared.`}
        </div>
        {highlights.length > 0 ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/70 mb-1">
              Highlights
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-emerald-50/85">
              {highlights.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {suggestions.length > 0 ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/70 mb-1">
              Suggested Replies
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-emerald-100/90">
              {suggestions.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-200/70">
          <span className="truncate max-w-[14rem]">{meta.filename}</span>
          <span>{formatBytesReadable(meta.size)}</span>
          {meta.mimetype ? <span>{meta.mimetype}</span> : null}
        </div>
        {context.tagline ? (
          <div className="mt-3 text-[10px] text-emerald-200/60 uppercase tracking-[0.2em]">
            {context.tagline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ChatWindow() {
  const channels = useChatStore((s) => s.channels);
  const messagesMap = useChatStore((s) => s.messages);
  const pinnedByChannel = useChatStore((s) => s.pinnedByChannel);
  const setChannelPins = useChatStore((s) => s.setChannelPins);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActive = useChatStore((s) => s.setActiveChannel);
  const presenceByChannel = useChatStore((s) => s.presenceByChannel);
  const messages = useMemo(() => messagesMap[activeChannelId ?? ""] ?? [], [messagesMap, activeChannelId]);
  const renderMessages = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof messages = [] as any;
    for (const m of messages) {
      const key = String(m.id || "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out;
  }, [messages]);
  const send = useChatStore((s) => s.sendMessage);

  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const { mode, baseUrl } = useConnection();
  const [showVideo, setShowVideo] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showPinnedList, setShowPinnedList] = useState(false);
  const [messageMenu, setMessageMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Array<{ id: string; name: string; email: string; avatarUrl: string | null; isTeacher: boolean }>>([]);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  // In-app call state
  const [incomingCall, setIncomingCall] = useState<{ channelId: string; kind: "video" | "voice"; from?: string; fromSocketId?: string } | null>(null);
  const [inCall, setInCall] = useState(false);
  const [callKind, setCallKind] = useState<"video" | "voice" | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerSocketIdRef = useRef<string | null>(null);
  // Long-press support for opening call modals
  const videoPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voicePressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressVideoClickRef = useRef(false);
  const suppressVoiceClickRef = useRef(false);
  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const { displayName, avatarUrl, userId } = useAuth();
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizeAvatar = (u?: string | null) => {
    if (!u) return null;
    try {
      const api = baseUrl ? baseUrl.replace(/\/$/, "") : "";
      // If relative path (e.g., /uploads/abc.png), point to current API base when available
      if (u.startsWith("/")) {
        if (api) return `${api}${u}`;
        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
        return `http://${host}:4000${u}`;
      }
      // If old localhost URL is stored, rewrite to current API base if possible
      if (api) {
        return u
          .replace("http://localhost:4000", api)
          .replace("http://127.0.0.1:4000", api);
      }
      return u;
    } catch {
      return u;
    }
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, activeChannelId]);

  // Track my socket id for alignment
  useEffect(() => {
    if (!baseUrl) return;
    let mounted = true;
    (async () => {
      try {
        const { getSocket } = await import("@/lib/socket");
        const s = await getSocket(baseUrl);
        const handler = () => mounted && setMySocketId(s.id || null);
        handler();
        s.on("connect", handler);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [baseUrl]);

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Manila",
      }),
    []
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const Icon = {
    paperclip: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.2a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
      </svg>
    ),
    send: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
    )
  };

  const active = channels.find(c => c.id === activeChannelId);
  const currentPins = activeChannelId ? pinnedByChannel[activeChannelId] || [] : [];
  const primaryPin = currentPins[0] || null;
  const activeMeta = (active?.meta || {}) as Record<string, unknown>;
  const activeOtherIsTeacher = Boolean(activeMeta.otherIsTeacher);
  const otherUserId = typeof activeMeta.otherId === "string" ? activeMeta.otherId : null;
  const activePresence = presenceByChannel[activeChannelId ?? ""] || {};
  const otherPresenceTs = otherUserId && typeof activePresence[otherUserId] === "number" ? activePresence[otherUserId] as number : null;
  const inviteLink = useMemo(() => {
    if (!activeChannelId) return "";
    try {
      const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const base = baseUrl ? baseUrl.replace(/\/$/, "") : `http://${host}:4000`;
      return `${base}/join/${encodeURIComponent(activeChannelId)}`;
    } catch { return ""; }
  }, [activeChannelId, baseUrl]);

  const apiBase = useMemo(() => (baseUrl || "").replace(/\/$/, ""), [baseUrl]);

  const isSectionGroup = Boolean(active && active.kind === "section-group");
  const createdBy = useMemo(() => {
    const t = String(active?.topic || "");
    const parts = t.split(";").map((s) => s.trim());
    const found = parts.find((p) => p.startsWith("createdBy:"));
    return found ? found.slice("createdBy:".length).trim() : "";
  }, [active?.topic]);
  const canManageGroup = Boolean(isSectionGroup && createdBy && userId && createdBy === userId);
  const canClaimGroup = Boolean(isSectionGroup && !createdBy && userId);

  useEffect(() => {
    (async () => {
      if (!showInfo) return;
      setInfoError(null);
      setGroupMembers([]);
      setRenameValue(active?.name || "");
      if (!isSectionGroup) return;
      try {
        setInfoLoading(true);
        const token = getToken();
        if (!token) throw new Error("unauthorized");
        const res = await fetch(`${apiBase}/section-groups/${encodeURIComponent(activeChannelId || "")}/members`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(data?.error || `members_${res.status}`));
        setGroupMembers(Array.isArray(data?.members) ? data.members : []);
      } catch (e: any) {
        setInfoError(e?.message || "Failed to load members");
      } finally {
        setInfoLoading(false);
      }
    })();
  }, [showInfo, isSectionGroup, apiBase, activeChannelId, active?.name]);

  // Attach/detach local video element when stream changes
  useEffect(() => {
    try {
      if (videoElRef.current) {
        videoElRef.current.srcObject = videoStream as any;
      }
    } catch {}
  }, [videoStream]);

  // Set up socket signaling listeners for WebRTC
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      try {
        if (!baseUrl) return;
        const { getSocket } = await import("@/lib/socket");
        const s = await getSocket(baseUrl);
        const onInvite = (evt: { channelId: string; kind: "video" | "voice"; from?: string; fromSocketId?: string; fromUserId?: string }) => {
          // Ignore my own invites (caller should not see Accept/Decline)
          if ((evt.fromSocketId && evt.fromSocketId === s.id) || (evt.fromUserId && userId && evt.fromUserId === userId)) return;
          // Show modal regardless of currently viewed channel so user doesn't miss calls
          setIncomingCall({ channelId: evt.channelId, kind: evt.kind, from: evt.from, fromSocketId: evt.fromSocketId || null as any });
        };
        const onOffer = async (evt: { channelId: string; sdp: any; fromSocketId?: string }) => {
          if (evt.channelId !== activeChannelId) return;
          // Prepare local media if needed
          if (!pcRef.current) {
            await ensureLocalForKind(callKind || incomingCall?.kind || "video");
            await createPeerConnection(s);
          }
          peerSocketIdRef.current = evt.fromSocketId || null;
          try {
            await pcRef.current!.setRemoteDescription(new RTCSessionDescription(evt.sdp));
            const answer = await pcRef.current!.createAnswer();
            await pcRef.current!.setLocalDescription(answer);
            s.emit("webrtc:answer", { channelId: activeChannelId, sdp: answer, toSocketId: evt.fromSocketId });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[webrtc] onOffer error", e);
          }
        };
        const onAnswer = async (evt: { channelId: string; sdp: any; fromSocketId?: string }) => {
          if (evt.channelId !== activeChannelId) return;
          if (!pcRef.current) return;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(evt.sdp));
        };
        const onCandidate = async (evt: { channelId: string; candidate: any; fromSocketId?: string }) => {
          if (evt.channelId !== activeChannelId) return;
          if (!pcRef.current) return;
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(evt.candidate)); } catch {}
        };
        const onCallEnd = (evt: { channelId: string; fromSocketId?: string }) => {
          if (evt.channelId !== activeChannelId) return;
          // Peer ended the call - clean up locally
          endCall();
        };
        // When callee accepts, they send call:accept - caller should now send offer
        const onCallAccept = async (evt: { channelId: string; fromSocketId?: string }) => {
          if (evt.channelId !== activeChannelId) return;
          if (!pcRef.current || !inCall) return;
          // Callee is ready - send offer now
          peerSocketIdRef.current = evt.fromSocketId || null;
          try {
            const offer = await pcRef.current.createOffer();
            await pcRef.current.setLocalDescription(offer);
            s.emit("webrtc:offer", { channelId: activeChannelId, sdp: offer, toSocketId: evt.fromSocketId });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[webrtc] onCallAccept error creating offer", e);
          }
        };
        s.on("call:invite", onInvite);
        s.on("webrtc:offer", onOffer);
        s.on("webrtc:answer", onAnswer);
        s.on("webrtc:candidate", onCandidate);
        s.on("call:end", onCallEnd);
        s.on("call:accept", onCallAccept);
        cleanup = () => {
          try {
            s.off("call:invite", onInvite);
            s.off("webrtc:offer", onOffer);
            s.off("webrtc:answer", onAnswer);
            s.off("webrtc:candidate", onCandidate);
            s.off("call:end", onCallEnd);
            s.off("call:accept", onCallAccept);
          } catch {}
        };
      } catch {}
    })();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, activeChannelId]);

  const ensureLocalForKind = async (kind: "video" | "voice") => {
    if (kind === "video") {
      if (!videoStream) await startVideo();
    } else {
      if (!audioStream) await startAudio();
    }
  };

  const createPeerConnection = async (socket: any) => {
    const { ICE_SERVERS } = await import("@/lib/config");
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc:candidate", { channelId: activeChannelId, candidate: e.candidate, toSocketId: peerSocketIdRef.current || undefined });
      }
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) setRemoteStream(stream);
    };
    // Add local tracks
    const local = videoStream || audioStream;
    if (local) for (const track of local.getTracks()) pc.addTrack(track, local);
    pcRef.current = pc;
  };

  const startCallWithPeer = async (kind: "video" | "voice") => {
    try {
      if (!baseUrl || !activeChannelId) return;
      const { getSocket } = await import("@/lib/socket");
      const s = await getSocket(baseUrl);
      setInCall(true);
      setCallKind(kind);
      setMicOn(true);
      setCamOn(kind === "video");
      await ensureLocalForKind(kind);
      await createPeerConnection(s);
      // Don't send offer yet - wait for callee to accept and send call:accept
      // The onCallAccept handler will send the offer when callee is ready
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[webrtc] startCallWithPeer error", e);
    }
  };

  const endCall = async () => {
    try {
      // Notify peer that we're ending the call
      if (baseUrl && activeChannelId && peerSocketIdRef.current) {
        const { getSocket } = await import("@/lib/socket");
        const s = await getSocket(baseUrl);
        s.emit("call:end", { channelId: activeChannelId, toSocketId: peerSocketIdRef.current });
      }
      pcRef.current?.getSenders().forEach((s) => { try { s.track && s.track.stop(); } catch {} });
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    peerSocketIdRef.current = null;
    setRemoteStream(null);
    setInCall(false);
    setCallKind(null);
    setMicOn(false);
    setCamOn(false);
    stopVideo();
    stopAudio();
  };

  // WebRTC call overlay: we show End only.

  // Helpers to start/stop local media
  const startVideo = async () => {
    try {
      if (videoStream) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setVideoStream(stream);
    } catch {}
  };
  const stopVideo = () => {
    try {
      for (const tr of videoStream?.getTracks?.() || []) tr.stop();
    } catch {}
    setVideoStream(null);
  };
  const startAudio = async () => {
    try {
      if (audioStream) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setAudioStream(stream);
    } catch {}
  };
  const stopAudio = () => {
    try {
      for (const tr of audioStream?.getTracks?.() || []) tr.stop();
    } catch {}
    setAudioStream(null);
  };

  const normalizeAttachment = (u?: string | null) => {
    if (!u) return null;
    try {
      const api = baseUrl ? baseUrl.replace(/\/$/, "") : "";
      if (u.startsWith("/")) {
        if (api) return `${api}${u}`;
        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
        return `http://${host}:4000${u}`;
      }
      if (api) {
        return u
          .replace("http://localhost:4000", api)
          .replace("http://127.0.0.1:4000", api);
      }
      return u;
    } catch {
      return u;
    }
  };

  const isImageUrl = (t: string) => /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(t);

  const lastOtherAvatar = useMemo(() => {
    const list = messagesMap[activeChannelId ?? ""] ?? [];
    const rev = [...list].reverse();
    for (const mm of rev) {
      const mineTest = (userId && mm.senderId === userId) || (mySocketId && (mm as any).senderSocketId === mySocketId);
      if (!mineTest) return mm.senderAvatarUrl || null;
    }
    return null;
  }, [messagesMap, activeChannelId, userId, mySocketId]);

  const seenMessageId = useMemo(() => {
    if (!otherPresenceTs) return null;
    let latest: string | null = null;
    for (const m of renderMessages) {
      const mine = (userId && m.senderId === userId) || (mySocketId && m.senderSocketId === mySocketId) ? true : false;
      const created = typeof m.createdAt === "number" ? m.createdAt : Number(m.createdAt || 0);
      if (mine && created && otherPresenceTs >= created) {
        latest = m.id;
      }
    }
    return latest;
  }, [renderMessages, otherPresenceTs, userId, mySocketId]);

  const isDM = active?.kind === "dm";
  const isGeneral = active?.kind === "general" || active?.id === "gen";
  const canStartCall = !isGeneral;

  return (
    <div className="h-full flex flex-col">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full overflow-hidden border border-white/20 bg-white/10">
            {active?.kind === 'dm' && lastOtherAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={normalizeAvatar(lastOtherAvatar)!} alt="User" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full grid place-items-center text-white/60">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="9" r="3.2"/><path d="M4 20c0-3.5 4-5.5 8-5.5s8 2 8 5.5"/></svg>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate tracking-wider font-medium text-sm">{active?.name ?? "Chat"}</span>
              {active?.kind === 'dm' && activeOtherIsTeacher && (
                <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-[1px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">
                  Teacher
                </span>
              )}
            </div>
            <div className="text-[11px] text-white/50 truncate">{active?.kind === 'dm' ? 'Direct Message' : (active?.topic ?? '')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-white/80">
          {canStartCall && (
            <>
              <button
                onContextMenu={(e) => { e.preventDefault(); setShowVideo(true); }}
                onMouseDown={() => {
                  if (videoPressTimerRef.current) clearTimeout(videoPressTimerRef.current);
                  videoPressTimerRef.current = setTimeout(() => { suppressVideoClickRef.current = true; setShowVideo(true); }, 600);
                }}
                onMouseUp={() => { if (videoPressTimerRef.current) { clearTimeout(videoPressTimerRef.current); videoPressTimerRef.current = null; } }}
                onMouseLeave={() => { if (videoPressTimerRef.current) { clearTimeout(videoPressTimerRef.current); videoPressTimerRef.current = null; } }}
                onClick={async () => {
                  try {
                    if (suppressVideoClickRef.current) { suppressVideoClickRef.current = false; return; }
                    if (!activeChannelId || !baseUrl) return;
                    const { getSocket } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "video", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("video");
                  } catch {}
                }}
                className="h-8 w-8 rounded-md border border-white/20 bg-black/40 grid place-items-center hover:bg-white/10" title="Video">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>
              </button>
              <button
                onContextMenu={(e) => { e.preventDefault(); setShowCall(true); }}
                onMouseDown={() => {
                  if (voicePressTimerRef.current) clearTimeout(voicePressTimerRef.current);
                  voicePressTimerRef.current = setTimeout(() => { suppressVoiceClickRef.current = true; setShowCall(true); }, 600);
                }}
                onMouseUp={() => { if (voicePressTimerRef.current) { clearTimeout(voicePressTimerRef.current); voicePressTimerRef.current = null; } }}
                onMouseLeave={() => { if (voicePressTimerRef.current) { clearTimeout(voicePressTimerRef.current); voicePressTimerRef.current = null; } }}
                onClick={async () => {
                  try {
                    if (suppressVoiceClickRef.current) { suppressVoiceClickRef.current = false; return; }
                    if (!activeChannelId || !baseUrl) return;
                    const { getSocket } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "voice", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("voice");
                  } catch {}
                }}
                className="h-8 w-8 rounded-md border border-white/20 bg-black/40 grid place-items-center hover:bg-white/10" title="Call">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72c.13.98.36 1.94.69 2.86a2 2 0 0 1-.45 2.11l-1.27 1.27a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.92.33 1.88.56 2.86.69A2 2 0 0 1 22 16.92z"/></svg>
              </button>
            </>
          )}
          <button onClick={() => setShowMore((v) => !v)} className="h-8 w-8 rounded-md border border-white/20 bg-black/40 grid place-items-center hover:bg-white/10" title="More">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
          </button>
        </div>
      </div>
      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white/80">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="9" r="3.2"/><path d="M4 20c0-3.5 4-5.5 8-5.5s8 2 8 5.5"/></svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate tracking-wider font-medium">{active?.name ?? "Chat"}</span>
              {active?.kind === 'dm' && activeOtherIsTeacher && (
                <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-[1px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">
                  Teacher
                </span>
              )}
            </div>
            <div className="text-xs text-white/50 truncate">{active?.kind === 'dm' ? 'Online' : (active?.topic ?? '')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-white/80">
          {canStartCall && (
            <>
              <button
                onContextMenu={(e) => { e.preventDefault(); setShowVideo(true); }}
                onMouseDown={() => {
                  if (videoPressTimerRef.current) clearTimeout(videoPressTimerRef.current);
                  videoPressTimerRef.current = setTimeout(() => { suppressVideoClickRef.current = true; setShowVideo(true); }, 600);
                }}
                onMouseUp={() => { if (videoPressTimerRef.current) { clearTimeout(videoPressTimerRef.current); videoPressTimerRef.current = null; } }}
                onMouseLeave={() => { if (videoPressTimerRef.current) { clearTimeout(videoPressTimerRef.current); videoPressTimerRef.current = null; } }}
                onClick={async () => {
                  try {
                    if (suppressVideoClickRef.current) { suppressVideoClickRef.current = false; return; }
                    if (!activeChannelId || !baseUrl) return;
                    const { getSocket } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "video", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("video");
                  } catch {}
                }}
                className="h-8 w-8 rounded-md border border-white/20 bg-black/40 grid place-items-center hover:bg-white/10" title="Video">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>
              </button>
              <button
                onContextMenu={(e) => { e.preventDefault(); setShowCall(true); }}
                onMouseDown={() => {
                  if (voicePressTimerRef.current) clearTimeout(voicePressTimerRef.current);
                  voicePressTimerRef.current = setTimeout(() => { suppressVoiceClickRef.current = true; setShowCall(true); }, 600);
                }}
                onMouseUp={() => { if (voicePressTimerRef.current) { clearTimeout(voicePressTimerRef.current); voicePressTimerRef.current = null; } }}
                onMouseLeave={() => { if (voicePressTimerRef.current) { clearTimeout(voicePressTimerRef.current); voicePressTimerRef.current = null; } }}
                onClick={async () => {
                  try {
                    if (suppressVoiceClickRef.current) { suppressVoiceClickRef.current = false; return; }
                    if (!activeChannelId || !baseUrl) return;
                    const { getSocket } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "voice", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("voice");
                  } catch {}
                }}
                className="h-8 w-8 rounded-md border border-white/20 bg-black/40 grid place-items-center hover:bg-white/10" title="Call">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72c.13.98.36 1.94.69 2.86a2 2 0 0 1-.45 2.11l-1.27 1.27a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.92.33 1.88.56 2.86.69A2 2 0 0 1 22 16.92z"/></svg>
              </button>
            </>
          )}
          <button onClick={() => setShowMore((v) => !v)} className="h-8 w-8 rounded-md border border-white/20 bg-black/40 grid place-items-center hover:bg-white/10" title="More">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {primaryPin ? (
          <div className="flex justify-between items-center px-4 py-2 mb-2 rounded-xl border border-amber-200/40 bg-amber-500/15 text-amber-100">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-amber-200/70 mb-1">Pinned</div>
              <div className="text-sm font-medium truncate">{primaryPin.message?.senderName || "Unknown"}</div>
              <div className="text-sm text-amber-100/90 truncate">{primaryPin.message?.text || "(attachment)"}</div>
              <div className="text-[11px] text-amber-200/60 mt-1">
                Pinned by {primaryPin.pinnedByName || "Someone"}
                {primaryPin.pinnedAt ? ` • ${new Date(primaryPin.pinnedAt).toLocaleString()}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-amber-200/50 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 text-xs"
                onClick={() => setShowPinnedList(true)}
              >View all ({currentPins.length})</button>
              <button
                className="rounded-md border border-amber-200/50 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 text-xs"
                onClick={async () => {
                  if (!activeChannelId || !baseUrl || !primaryPin?.message?.id) return;
                  try {
                    const token = getToken();
                    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/channels/${activeChannelId}/pin?messageId=${encodeURIComponent(primaryPin.message.id)}`, {
                      method: "DELETE",
                      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    });
                    if (res.ok) {
                      const data = await res.json();
                      if (Array.isArray(data.pins)) setChannelPins(activeChannelId, data.pins);
                    }
                  } catch {}
                }}
              >Unpin</button>
            </div>
          </div>
        ) : null}
        {(() => {
          const lastOther = [...renderMessages].reverse().find((mm) => {
            const mineTest = (userId && mm.senderId === userId) || (mySocketId && mm.senderSocketId === mySocketId);
            return !mineTest;
          });
          const lastOtherAvatar = lastOther?.senderAvatarUrl || null;
          return renderMessages.map((m) => {
            const mine = (userId && m.senderId === userId) || (mySocketId && m.senderSocketId === mySocketId) ? true : false;
            const isPinned = currentPins.some((pin) => pin.message?.id === m.id);
            return (
              <div key={m.id} className="space-y-1">
                {/* Name label above bubble */}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="flex items-center gap-2 text-[11px] opacity-70 px-12 pt-2">
                    <span>{mine ? "You" : m.senderName}</span>
                    {m.senderIsTeacher ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2 py-[1px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">
                        Teacher
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className={`relative flex items-end ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (
                    <div className="h-8 w-8 rounded-full bg-white/5 border border-white/25 mr-2 overflow-hidden">
                      {normalizeAvatar(m.senderAvatarUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={normalizeAvatar(m.senderAvatarUrl)!} alt={m.senderName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-white/50">?</div>
                      )}
                    </div>
                  )}
                  <div className={`relative group max-w-[80%] rounded-2xl px-4 py-2 border ${mine ? "border-emerald-200/60" : "border-white/30"} text-white`}>
                    <button
                      type="button"
                      className={`absolute -top-3 right-2 hidden group-hover:flex items-center justify-center h-6 w-6 rounded-full border border-white/20 bg-black/80 text-white/80 hover:text-white hover:bg-white/20 transition-colors`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof document === "undefined") return;
                        const rect = (e.currentTarget.getBoundingClientRect?.() || { left: 0, top: 0, height: 0, width: 0 }) as DOMRect;
                        setMessageMenu({ id: m.id, x: rect.left + rect.width, y: rect.top + rect.height });
                      }}
                      aria-label="Message actions"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M6 3v18l6-4 6 4V3z" />
                      </svg>
                    </button>
                    {typeof m.text === 'string' && (m.text.startsWith('/uploads/') || m.text.startsWith('http')) ? (
                      isImageUrl(m.text) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={normalizeAttachment(m.text)!} alt={m.context?.meta?.filename || "attachment"} className="max-w-xs md:max-w-sm rounded-md" />
                      ) : (
                        <a href={normalizeAttachment(m.text) || '#'} target="_blank" rel="noreferrer" className="underline break-all">
                          {m.context?.meta?.filename || m.text.split('/').pop() || m.text}
                        </a>
                      )
                    ) : (
                      <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
                    )}
                  </div>
                  {mine && (
                    <div className="h-8 w-8 rounded-full bg-white/5 border border-white/25 ml-2 overflow-hidden">
                      {normalizeAvatar(avatarUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={normalizeAvatar(avatarUrl)!} alt="Me" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-white/50">?</div>
                      )}
                    </div>
                  )}
                </div>
                {m.context ? (
                  <SmartContextCard context={m.context} align={mine ? "right" : "left"} />
                ) : null}
                {/* Meta row: time and tiny avatar-as-seen for own messages */}
                <div className={`flex items-center ${mine ? "justify-end" : "justify-start"} gap-2 px-10 md:px-16`}>
                  <div className="text-[10px] opacity-70">{timeFmt.format(new Date(m.createdAt))}</div>
                  {mine && seenMessageId === m.id && normalizeAvatar(lastOtherAvatar) && (
                    <div className="h-4 w-4 rounded-full overflow-hidden border border-white/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={normalizeAvatar(lastOtherAvatar)!} alt="Seen by" className="h-full w-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })()}
        {renderMessages.length === 0 && (
          <div className="text-sm text-gray-500">No messages. Say hello!</div>
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || !activeChannelId) return;
          const body = text.trim();
          // Optimistic UI (both LAN and CLOUD). Server echo will reconcile by id.
          send(activeChannelId, body);

          // Persist via socket whenever we have an API baseUrl (LAN or CLOUD)
          if (baseUrl) {
            try {
              const { getSocket, joinRoom } = await import("@/lib/socket");
              const socket = await getSocket(baseUrl);
              // Ensure connection
              if (!socket.connected) {
                try {
                  await new Promise<void>((resolve, reject) => {
                    const t = setTimeout(() => reject(new Error("connect_timeout")), 2000);
                    socket.once("connect", () => { clearTimeout(t); resolve(); });
                    socket.connect();
                  });
                } catch {}
              }
              // Ensure room join before sending
              try { await joinRoom(baseUrl, activeChannelId); } catch {}
              socket.emit("message:send", {
                channelId: activeChannelId,
                text: body,
                senderName: displayName || "You",
                senderAvatarUrl: avatarUrl || null,
                senderId: userId || undefined,
              });
            } catch {}
          }
          setText("");
        }}
        className="p-3 md:p-4 border-t border-white/10"
      >
        <div className="rounded-full border border-white/20 bg-black/30 px-3 py-2 flex items-center gap-2">
          <textarea
            value={text}
            onChange={async (e) => {
              setText(e.target.value);
              try {
                if (baseUrl && activeChannelId) {
                  const { getSocket } = await import("@/lib/socket");
                  const socket = await getSocket(baseUrl);
                  socket.emit("typing", { channelId: activeChannelId, userId: userId || socket.id, name: displayName || "You", isTyping: true });
                  if (typingTimer.current) clearTimeout(typingTimer.current);
                  typingTimer.current = setTimeout(() => {
                    try { socket.emit("typing", { channelId: activeChannelId, userId: userId || socket.id, name: displayName || "You", isTyping: false }); } catch {}
                  }, 2000);
                }
              } catch {}
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
              }
            }}
            onBlur={async () => {
              try {
                if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
                if (baseUrl && activeChannelId) {
                  const { getSocket } = await import("@/lib/socket");
                  const socket = await getSocket(baseUrl);
                  socket.emit("typing", { channelId: activeChannelId, userId: userId || socket.id, name: displayName || "You", isTyping: false });
                }
              } catch {}
            }}
            rows={1}
            placeholder={activeChannelId ? "Your message…" : "Select a channel to start"}
            className="flex-1 bg-transparent outline-none resize-none text-base md:text-sm text-white placeholder-white/40 px-2 py-1"
          />
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={async (e) => {
              try {
                const file = e.target.files?.[0];
                if (!file || !activeChannelId) return;
                const form = new FormData();
                form.append("file", file);
                const base = (baseUrl || (typeof window !== 'undefined' ? `http://${window.location.hostname}:4000` : "http://localhost:4000")).replace(/\/$/, "");
                const resp = await fetch(`${base}/upload/file`, { method: "POST", body: form });
                if (!resp.ok) return;
                const data = await resp.json();
                const path: string | null = typeof data?.url === "string" ? data.url : null;
                if (!path) return;
                const metaFilename = typeof data?.filename === "string" && data.filename.trim() ? data.filename : file.name;
                const metaMimetype = typeof data?.mimetype === "string" && data.mimetype.trim() ? data.mimetype : file.type || undefined;
                const metaSize = typeof data?.size === "number" && Number.isFinite(data.size) ? data.size : file.size;
                const textToSend = path;
                const metaPayload = {
                  filename: metaFilename,
                  mimetype: metaMimetype || "application/octet-stream",
                  size: metaSize,
                };
                // Optimistic UI
                send(activeChannelId, textToSend, {
                  summary: `${metaFilename} (${formatBytesReadable(metaSize)}) was shared.`,
                  highlights: [],
                  suggestions: [],
                  tagline: "Smart Contextual Messaging",
                  meta: metaPayload,
                });

                // Persist via socket whenever baseUrl exists
                if (baseUrl) {
                  try {
                    const { getSocket, joinRoom } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    try { await joinRoom(baseUrl, activeChannelId); } catch {}
                    socket.emit("message:send", {
                      channelId: activeChannelId,
                      text: textToSend,
                      senderName: displayName || "You",
                      senderAvatarUrl: avatarUrl || null,
                      senderId: userId || undefined,
                      contextMeta: metaPayload,
                    });
                  } catch {}
                }
                // clear input
                e.currentTarget.value = "";
              } catch {}
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="h-9 w-9 rounded-md border border-white/20 bg-black/40 grid place-items-center text-white hover:bg-white/10" title="Attach file">
            {Icon.paperclip}
          </button>
          <button type="submit" disabled={!activeChannelId} className="h-9 w-9 rounded-full border border-white/20 bg-black/40 grid place-items-center text-white hover:bg-white/10 disabled:opacity-50" title="Send">
            {Icon.send}
          </button>
        </div>
      </form>

      {messageMenu && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[70]" onClick={() => setMessageMenu(null)}>
          <div
            className="absolute w-[190px] rounded-xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-xl divide-y divide-white/10"
            style={{ left: `${Math.max(8, messageMenu.x - 180)}px`, top: `${messageMenu.y + 8}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm"
              onClick={async () => {
                if (!activeChannelId || !baseUrl) return;
                try {
                  const token = getToken();
                  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/channels/${activeChannelId}/pin`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ messageId: messageMenu.id }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.pins)) setChannelPins(activeChannelId, data.pins);
                  }
                } catch {}
                setMessageMenu(null);
              }}
            >Pin message</button>
            {currentPins.some((pin) => pin.message?.id === messageMenu.id) ? (
              <button
                className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm"
                onClick={async () => {
                  if (!activeChannelId || !baseUrl) return;
                  try {
                    const token = getToken();
                    await fetch(`${baseUrl.replace(/\/$/, "")}/channels/${activeChannelId}/pin?messageId=${encodeURIComponent(messageMenu.id)}`, {
                      method: "DELETE",
                      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    });
                  } catch {}
                  setMessageMenu(null);
                }}
              >Unpin</button>
            ) : null}
          </div>
        </div>, document.body) : null}

      {showVideo && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setShowVideo(false)}>
          <div className="absolute right-3 top-[120px] md:right-8 md:top-[120px] w-[92%] md:w-[520px] rounded-2xl border border-white/20 bg-black/80 backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-white/80 text-sm">Start video call</div>
              <button className="text-[11px] text-white/60 hover:text-white" onClick={() => setShowVideo(false)}>Close</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="rounded-xl border border-white/20 bg-black/40 p-3">
                <div className="mt-1 flex gap-2 items-center">
                  <button
                    className="ml-auto rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs"
                    onClick={async () => {
                      try {
                        if (!activeChannelId || !baseUrl) return;
                        const { getSocket } = await import("@/lib/socket");
                        const socket = await getSocket(baseUrl);
                        socket.emit("call:invite", { channelId: activeChannelId, kind: "video", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                        setShowVideo(false);
                        await startCallWithPeer("video");
                      } catch {}
                    }}
                  >Start call</button>
                </div>
              </div>
            </div>
          </div>
        </div>, document.body) : null}

      {showCall && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => { setShowCall(false); stopAudio(); }}>
          <div className="absolute right-3 top-[120px] md:right-8 md:top-[120px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-black/80 backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-white/80 text-sm">Start voice call</div>
              <button className="text-[11px] text-white/60 hover:text-white" onClick={() => { setShowCall(false); stopAudio(); }}>Close</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="rounded-xl border border-white/20 bg-black/40 p-3">
                <div className="mt-1 flex gap-2 items-center">
                  <button
                    className="ml-auto rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs"
                    onClick={async () => {
                      try {
                        if (!activeChannelId || !baseUrl) return;
                        const { getSocket } = await import("@/lib/socket");
                        const socket = await getSocket(baseUrl);
                        socket.emit("call:invite", { channelId: activeChannelId, kind: "voice", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                        setShowCall(false);
                        await startCallWithPeer("voice");
                      } catch {}
                    }}
                  >Start call</button>
                </div>
              </div>
            </div>
          </div>
        </div>, document.body) : null}

      {incomingCall && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[70]" onClick={() => setIncomingCall(null)}>
          <div className="absolute right-3 top-[140px] md:right-8 md:top-[140px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-black/85 backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-white/80 text-sm">Incoming {incomingCall.kind === 'video' ? 'video' : 'voice'} call</div>
              <button className="text-[11px] text-white/60 hover:text-white" onClick={() => setIncomingCall(null)}>Dismiss</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="text-white/70 text-sm">{incomingCall.from || 'Someone'} is calling you.</div>
              <div className="flex gap-2 justify-end">
                <button
                  className="rounded-lg border border-red-300/40 bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 text-xs"
                  onClick={() => setIncomingCall(null)}
                >Decline</button>
                <button
                  className="rounded-lg border border-emerald-300/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 text-xs"
                  onClick={async () => {
                    try {
                      if (!incomingCall?.channelId) return;
                      const kind = incomingCall.kind;
                      const fromSocketId = incomingCall.fromSocketId;
                      if (!baseUrl) return;
                      if (incomingCall.channelId !== activeChannelId) setActive(incomingCall.channelId);
                      setIncomingCall(null);
                      // Small delay to let UI switch channel if needed
                      await new Promise(r => setTimeout(r, 100));
                      // As callee, we do NOT create an offer - we wait for caller's offer
                      // Set up local media and peer connection, then notify caller we're ready
                      setInCall(true);
                      setCallKind(kind);
                      setMicOn(true);
                      setCamOn(kind === "video");
                      await ensureLocalForKind(kind);
                      const { getSocket } = await import("@/lib/socket");
                      const s = await getSocket(baseUrl);
                      await createPeerConnection(s);
                      peerSocketIdRef.current = fromSocketId || null;
                      // Notify caller that we're ready to receive offer
                      s.emit("call:accept", { channelId: incomingCall.channelId, toSocketId: fromSocketId });
                      // The onOffer handler will receive caller's offer and send answer
                    } catch {}
                  }}
                >Accept</button>
              </div>
            </div>
          </div>
        </div>, document.body) : null}

      {inCall && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[65]" onClick={(e) => e.stopPropagation()}>
          <div className="absolute right-3 bottom-3 md:right-8 md:bottom-8 w-[92%] md:w-[680px] rounded-2xl border border-white/20 bg-black/85 backdrop-blur-xl shadow-xl p-3">
            <div className="flex items-center gap-2 justify-between mb-2">
              <div className="text-white/80 text-sm truncate">{callKind === 'video' ? 'Video call' : 'Voice call'}</div>
              <div className="flex items-center gap-2">
                <button onClick={endCall} className="h-8 px-3 rounded-md border border-red-300/40 bg-red-500/20 hover:bg-red-500/30 text-xs text-white">End</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[220px] md:min-h-[320px]">
              <div className="rounded-xl border border-white/15 bg-black/40 overflow-hidden min-h-[180px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <video ref={videoElRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              </div>
              <div className="rounded-xl border border-white/15 bg-black/40 overflow-hidden min-h-[180px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <video
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                  ref={(el) => {
                    try {
                      if (!el) return;
                      (el as any).srcObject = remoteStream as any;
                    } catch {}
                  }}
                />
              </div>
            </div>
          </div>
        </div>, document.body) : null}

      {showMore && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
          <div className="absolute right-3 top-[100px] md:right-8 md:top-[100px] w-[92%] md:w-[320px] rounded-2xl border border-white/20 bg-black/80 backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-white/80 text-sm">More</div>
              <button className="text-[11px] text-white/60 hover:text-white" onClick={() => setShowMore(false)}>Close</button>
            </div>
            <div className="divide-y divide-white/10">
              <button
                className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm"
                onClick={() => {
                  if (activeChannelId) {
                    setActive(activeChannelId); // clears unread for active via store logic
                  }
                  setShowMore(false);
                }}
              >Mark as read</button>
              <button
                className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm"
                onClick={() => {
                  setShowPinnedList(true);
                  setShowMore(false);
                }}
              >Pinned messages ({currentPins.length})</button>
              <button
                className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm"
                onClick={() => {
                  setShowInfo(true);
                  setShowMore(false);
                }}
              >Channel info</button>
            </div>
          </div>
        </div>, document.body) : null}

      {showInfo && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setShowInfo(false)}>
          <div className="absolute right-3 top-[120px] md:right-8 md:top-[120px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-black/80 backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-white/80 text-sm">Channel info</div>
              <button className="text-[11px] text-white/60 hover:text-white" onClick={() => setShowInfo(false)}>Close</button>
            </div>
            {(() => {
              const ch = channels.find(c => c.id === activeChannelId);
              return (
                <div className="p-3 space-y-2 text-sm text-white/80">
                  <div className="flex items-center justify-between gap-3"><div className="text-white/60">Name</div><div className="truncate">{ch?.name || ""}</div></div>
                  <div className="flex items-center justify-between gap-3"><div className="text-white/60">Type</div><div className="truncate capitalize">{ch?.kind || ""}</div></div>
                  {ch?.kind !== "section-group" ? (
                    <div className="flex items-center justify-between gap-3"><div className="text-white/60">Topic</div><div className="truncate">{ch?.topic || ""}</div></div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3"><div className="text-white/60">ID</div><div className="truncate">{ch?.id || ""}</div></div>

                  {ch?.kind === "section-group" ? (
                    <div className="pt-2 space-y-3">
                      <div className="text-white/60 text-xs uppercase tracking-[0.24em]">Members</div>
                      {infoLoading ? (
                        <div className="text-white/60">Loading…</div>
                      ) : infoError ? (
                        <div className="text-red-300">{infoError}</div>
                      ) : (
                        <div className="max-h-[180px] overflow-y-auto custom-scroll rounded-xl border border-white/10 bg-black/30">
                          {(groupMembers || []).map((m) => (
                            <div key={m.id} className="px-3 py-2 border-b border-white/10 last:border-b-0 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-white/90 truncate">{m.name}</div>
                                <div className="text-xs text-white/50 truncate">{m.email}</div>
                              </div>
                              {m.isTeacher ? (
                                <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-[2px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">Teacher</span>
                              ) : null}
                            </div>
                          ))}
                          {(!groupMembers || groupMembers.length === 0) ? (
                            <div className="px-3 py-3 text-white/60">No members.</div>
                          ) : null}
                        </div>
                      )}

                      {canManageGroup ? (
                        <div className="space-y-2">
                          <div className="text-white/60 text-xs uppercase tracking-[0.24em]">Manage</div>
                          <div className="flex items-center gap-2">
                            <input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="flex-1 rounded-xl border border-white/20 bg-black/30 text-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                              placeholder="Group name"
                            />
                            <button
                              className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-sm"
                              disabled={renaming}
                              onClick={async () => {
                                if (!activeChannelId) return;
                                const nextName = String(renameValue || "").trim();
                                if (!nextName) return;
                                try {
                                  setRenaming(true);
                                  const token = getToken();
                                  if (!token) throw new Error("unauthorized");
                                  const res = await fetch(`${apiBase}/section-groups/${encodeURIComponent(activeChannelId)}`, {
                                    method: "PATCH",
                                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: nextName }),
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(String(data?.error || `rename_${res.status}`));
                                  if (data?.channel?.id) {
                                    useChatStore.getState().setChannels(
                                      useChatStore.getState().channels.map((c) => (c.id === data.channel.id ? { ...c, name: data.channel.name, topic: data.channel.topic } : c)),
                                    );
                                  }
                                } catch (e: any) {
                                  setInfoError(e?.message || "Failed to rename");
                                } finally {
                                  setRenaming(false);
                                }
                              }}
                            >{renaming ? "Saving…" : "Save"}</button>
                          </div>

                          <button
                            className="w-full rounded-xl border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-sm text-red-200"
                            disabled={deleting}
                            onClick={async () => {
                              if (!activeChannelId) return;
                              try {
                                setDeleting(true);
                                const token = getToken();
                                if (!token) throw new Error("unauthorized");
                                const res = await fetch(`${apiBase}/section-groups/${encodeURIComponent(activeChannelId)}`, {
                                  method: "DELETE",
                                  headers: { Authorization: `Bearer ${token}` },
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(String(data?.error || `delete_${res.status}`));
                                useChatStore.getState().setChannels(useChatStore.getState().channels.filter((c) => c.id !== activeChannelId));
                                useChatStore.getState().setActiveChannel("gen");
                                setShowInfo(false);
                              } catch (e: any) {
                                setInfoError(e?.message || "Failed to delete");
                              } finally {
                                setDeleting(false);
                              }
                            }}
                          >{deleting ? "Deleting…" : "Delete group"}</button>
                        </div>
                      ) : canClaimGroup ? (
                        <div className="space-y-2">
                          <div className="text-xs text-white/60">This is a legacy group (created before rename/delete existed).</div>
                          <button
                            className="w-full rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-sm"
                            onClick={async () => {
                              if (!activeChannelId) return;
                              try {
                                setInfoError(null);
                                const token = getToken();
                                if (!token) throw new Error("unauthorized");
                                const res = await fetch(`${apiBase}/section-groups/${encodeURIComponent(activeChannelId)}/claim`, {
                                  method: "POST",
                                  headers: { Authorization: `Bearer ${token}` },
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(String(data?.error || `claim_${res.status}`));
                                if (data?.channel?.id) {
                                  useChatStore.getState().setChannels(
                                    useChatStore.getState().channels.map((c) => (c.id === data.channel.id ? { ...c, topic: data.channel.topic, name: data.channel.name } : c)),
                                  );
                                }
                              } catch (e: any) {
                                setInfoError(e?.message || "Failed to claim group");
                              }
                            }}
                          >Claim ownership (enable rename/delete)</button>
                          <div className="text-xs text-white/50">Only members can claim. First claim wins.</div>
                        </div>
                      ) : (
                        <div className="text-xs text-white/50">Only the group creator can rename or delete this group.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>, document.body) : null}

      {showPinnedList && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setShowPinnedList(false)}>
          <div className="absolute right-3 top-[140px] md:right-8 md:top-[140px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-black/80 backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-white/80 text-sm">Pinned messages</div>
              <button className="text-[11px] text-white/60 hover:text-white" onClick={() => setShowPinnedList(false)}>Close</button>
            </div>
            <div className="p-3 space-y-3 text-sm text-white/80">
              {currentPins.length > 0 ? (
                <div className="space-y-3">
                  {currentPins.map((pin) => (
                    <div key={pin.id} className="rounded-xl border border-white/15 bg-black/40 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{pin.message?.senderName || "Unknown"}</div>
                          <div className="text-white/70 whitespace-pre-wrap break-words">{pin.message?.text || "(attachment)"}</div>
                          <div className="text-xs text-white/50">
                            Pinned by {pin.pinnedByName || "Someone"}
                            {pin.pinnedAt ? ` • ${new Date(pin.pinnedAt).toLocaleString()}` : ""}
                          </div>
                        </div>
                        <button
                          className="shrink-0 rounded-md border border-amber-200/40 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1 text-xs text-amber-100"
                          onClick={async () => {
                            if (!activeChannelId || !baseUrl || !pin.message?.id) return;
                            try {
                              const token = getToken();
                              const res = await fetch(`${baseUrl.replace(/\/$/, "")}/channels/${activeChannelId}/pin?messageId=${encodeURIComponent(pin.message.id)}`, {
                                method: "DELETE",
                                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                              });
                              if (res.ok) {
                                const data = await res.json();
                                if (Array.isArray(data.pins)) setChannelPins(activeChannelId, data.pins);
                              }
                            } catch {}
                          }}
                        >Unpin</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-white/60">No pinned messages yet.</div>
              )}
            </div>
          </div>
        </div>, document.body) : null}
    </div>
  );
}
