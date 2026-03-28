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

function SmartContextCardCompact({ context, align }: { context: MessageContext; align: "left" | "right" }) {
  const meta = context.meta || { filename: "attachment", size: 0, mimetype: "" };
  const highlights = Array.isArray(context.highlights) ? context.highlights.filter(Boolean) : [];
  const suggestions = Array.isArray(context.suggestions) ? context.suggestions.filter(Boolean) : [];
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div className="mt-2 max-w-[80%] rounded-xl border border-emerald-500/20 bg-[color:var(--surface)]/70 px-3 py-2 text-[color:var(--foreground)] shadow-[0_0_10px_rgba(16,185,129,0.08)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-600/80">
          Smart Contextual Messaging
        </div>
        {context.summary ? (
          <div className="mt-1 text-[12px] text-[color:var(--foreground)]/85 whitespace-pre-wrap break-words">
            {context.summary}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--foreground)]/60">
          <span className="truncate max-w-[14rem]">{meta.filename}</span>
          <span>{formatBytesReadable(meta.size)}</span>
          {meta.mimetype ? <span>{meta.mimetype}</span> : null}
        </div>
        {(highlights.length > 0 || suggestions.length > 0) ? (
          <div className="mt-2 text-[11px] text-[color:var(--foreground)]/80">
            {highlights.length > 0 ? <div>Highlights: {highlights.slice(0, 2).join(" • ")}{highlights.length > 2 ? " …" : ""}</div> : null}
            {suggestions.length > 0 ? <div>Suggested: {suggestions.slice(0, 2).join(" • ")}{suggestions.length > 2 ? " …" : ""}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SmartContextCard({ context, align }: { context: MessageContext; align: "left" | "right" }) {
  const highlights = Array.isArray(context.highlights) ? context.highlights.filter(Boolean) : [];
  const suggestions = Array.isArray(context.suggestions) ? context.suggestions.filter(Boolean) : [];
  const meta = context.meta || { filename: "attachment", size: 0, mimetype: "" };
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div className="mt-2 max-w-[80%] rounded-2xl border border-emerald-500/25 bg-[color:var(--surface)]/70 px-4 py-3 text-[color:var(--foreground)] shadow-[0_0_12px_rgba(16,185,129,0.10)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600/80 mb-2">
          Smart Contextual Messaging
        </div>
        <div className="text-sm text-[color:var(--foreground)]/90 whitespace-pre-wrap break-words">
          {context.summary || `${meta.filename} was shared.`}
        </div>
        {highlights.length > 0 ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-600/70 mb-1">
              Highlights
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-[color:var(--foreground)]/85">
              {highlights.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {suggestions.length > 0 ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-600/70 mb-1">
              Suggested Replies
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-[color:var(--foreground)]/90">
              {suggestions.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--foreground)]/70">
          <span className="truncate max-w-[14rem]">{meta.filename}</span>
          <span>{formatBytesReadable(meta.size)}</span>
          {meta.mimetype ? <span>{meta.mimetype}</span> : null}
        </div>
        {context.tagline ? (
          <div className="mt-3 text-[10px] text-[color:var(--foreground)]/55 uppercase tracking-[0.2em]">
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
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);

  // Connection monitoring
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const { messages: allMessagesForSync, syncPendingMessages } = useChatStore();

  // Sync pending messages when coming back online
  useEffect(() => {
    if (isOnline && baseUrl) {
      syncPendingMessages(baseUrl);
    }
  }, [isOnline, baseUrl, syncPendingMessages]);

  const [messageMenu, setMessageMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Array<{ id: string; name: string; email: string; avatarUrl: string | null; isTeacher: boolean }>>([]);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const remoteVideoElRef = useRef<HTMLVideoElement>(null);
  const remoteAudioElRef = useRef<HTMLAudioElement>(null);
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

  const isMediaMessage = (msg?: any) => {
    const t = typeof msg?.text === "string" ? msg.text : "";
    if (!t) return false;
    if (!(t.startsWith("/uploads/") || t.startsWith("http"))) return false;
    return Boolean(normalizeAttachment(t));
  };

  const isImageMessage = (msg?: any) => {
    const t = typeof msg?.text === "string" ? msg.text : "";
    if (!t) return false;
    if (!(t.startsWith("/uploads/") || t.startsWith("http"))) return false;
    return isImageUrl(t);
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
        const local = (callKind === "video" ? videoStreamRef.current : null) || videoStream;
        (videoElRef.current as any).srcObject = local as any;
      }
    } catch {}
  }, [videoStream, callKind]);

  // Attach remote video element when stream arrives
  useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.log("[webrtc] remoteStream changed:", remoteStream?.id, "tracks:", remoteStream?.getTracks().length);
      if (remoteVideoElRef.current) {
        (remoteVideoElRef.current as any).srcObject = remoteStream || null;
        // eslint-disable-next-line no-console
        console.log("[webrtc] Set remote video srcObject");
      }
    } catch {}
  }, [remoteStream]);

  // Attach remote audio playback (needed for voice calls and for hearing remote audio in video calls)
  useEffect(() => {
    try {
      if (remoteAudioElRef.current) {
        (remoteAudioElRef.current as any).srcObject = remoteStream || null;
      }
    } catch {}
  }, [remoteStream]);

  // Join Socket.IO room when viewing a channel (needed for call invites)
  useEffect(() => {
    if (!baseUrl || !activeChannelId) return;
    (async () => {
      try {
        const { joinRoom } = await import("@/lib/socket");
        await joinRoom(baseUrl, activeChannelId);
        // eslint-disable-next-line no-console
        console.log("[socket] Joined room:", activeChannelId);
      } catch {}
    })();
  }, [baseUrl, activeChannelId]);

  // Set up socket signaling listeners for WebRTC
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      try {
        if (!baseUrl) return;
        const { getSocket } = await import("@/lib/socket");
        const s = await getSocket(baseUrl);
        const onInvite = (evt: { channelId: string; kind: "video" | "voice"; from?: string; fromSocketId?: string; fromUserId?: string }) => {
          // eslint-disable-next-line no-console
          console.log("[webrtc] onInvite received:", evt, "my socket.id:", s.id, "my userId:", userId);
          // Ignore my own invites (caller should not see Accept/Decline)
          if ((evt.fromSocketId && evt.fromSocketId === s.id) || (evt.fromUserId && userId && evt.fromUserId === userId)) {
            // eslint-disable-next-line no-console
            console.log("[webrtc] Ignoring own invite");
            return;
          }
          // Show modal regardless of currently viewed channel so user doesn't miss calls
          // eslint-disable-next-line no-console
          console.log("[webrtc] Showing incoming call modal");
          setIncomingCall({ channelId: evt.channelId, kind: evt.kind, from: evt.from, fromSocketId: evt.fromSocketId || null as any });
        };
        const onOffer = async (evt: { channelId: string; sdp: any; fromSocketId?: string }) => {
          // eslint-disable-next-line no-console
          console.log("[webrtc] onOffer received from:", evt.fromSocketId, "channel:", evt.channelId, "current:", activeChannelId);
          if (evt.channelId !== activeChannelId) return;
          // Prepare local media if needed
          if (!pcRef.current) {
            await ensureLocalForKind(callKind || incomingCall?.kind || "video");
            await createPeerConnection(s);
          }
          peerSocketIdRef.current = evt.fromSocketId || null;
          try {
            // Ensure local tracks are added before creating answer
            const local = videoStreamRef.current || audioStreamRef.current;
            if (local && pcRef.current) {
              const senders = pcRef.current.getSenders();
              for (const track of local.getTracks()) {
                if (!senders.find(sender => sender.track === track)) {
                  pcRef.current.addTrack(track, local);
                }
              }
            }
            // eslint-disable-next-line no-console
            console.log("[webrtc] Setting remote description (offer)");
            await pcRef.current!.setRemoteDescription(new RTCSessionDescription(evt.sdp));
            // eslint-disable-next-line no-console
            console.log("[webrtc] Creating answer");
            const answer = await pcRef.current!.createAnswer();
            // eslint-disable-next-line no-console
            console.log("[webrtc] Setting local description (answer)");
            await pcRef.current!.setLocalDescription(answer);
            // eslint-disable-next-line no-console
            console.log("[webrtc] Sending answer to:", evt.fromSocketId);
            s.emit("webrtc:answer", { channelId: activeChannelId, sdp: answer, toSocketId: evt.fromSocketId });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[webrtc] onOffer error", e);
          }
        };
        const onAnswer = async (evt: { channelId: string; sdp: any; fromSocketId?: string }) => {
          // eslint-disable-next-line no-console
          console.log("[webrtc] onAnswer received from:", evt.fromSocketId);
          if (evt.channelId !== activeChannelId) return;
          if (!pcRef.current) return;
          try {
            // eslint-disable-next-line no-console
            console.log("[webrtc] Setting remote description (answer)");
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(evt.sdp));
            // eslint-disable-next-line no-console
            console.log("[webrtc] Remote description set, connection should establish");
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[webrtc] onAnswer error:", e);
          }
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
          // eslint-disable-next-line no-console
          console.log("[webrtc] onCallAccept received:", evt, "activeChannelId:", activeChannelId, "pcRef.current:", !!pcRef.current);
          if (evt.channelId !== activeChannelId) {
            // eslint-disable-next-line no-console
            console.log("[webrtc] onCallAccept: channelId mismatch, ignoring");
            return;
          }
          if (!pcRef.current) {
            // eslint-disable-next-line no-console
            console.log("[webrtc] onCallAccept: no peer connection, ignoring");
            return;
          }
          // Callee is ready - send offer now
          peerSocketIdRef.current = evt.fromSocketId || null;
          // eslint-disable-next-line no-console
          console.log("[webrtc] onCallAccept: creating and sending offer to:", evt.fromSocketId);
          try {
            // Ensure local tracks are added before creating offer
            const local = videoStreamRef.current || audioStreamRef.current;
            if (local) {
              const senders = pcRef.current.getSenders();
              for (const track of local.getTracks()) {
                if (!senders.find(s => s.track === track)) {
                  pcRef.current.addTrack(track, local);
                }
              }
            }
            const offer = await pcRef.current.createOffer();
            await pcRef.current.setLocalDescription(offer);
            // eslint-disable-next-line no-console
            console.log("[webrtc] onCallAccept: offer created, emitting to socket:", evt.fromSocketId);
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
    if (pcRef.current) {
      // eslint-disable-next-line no-console
      console.log("[webrtc] Already have peer connection, skipping creation");
      return;
    }
    const { ICE_SERVERS } = await import("@/lib/config");
    // eslint-disable-next-line no-console
    console.log("[webrtc] Creating peer connection with ICE servers:", ICE_SERVERS);
    // eslint-disable-next-line no-console
    console.trace("[webrtc] createPeerConnection called from");
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        // eslint-disable-next-line no-console
        console.log("[webrtc] Sending ICE candidate");
        socket.emit("webrtc:candidate", { channelId: activeChannelId, candidate: e.candidate, toSocketId: peerSocketIdRef.current || undefined });
      }
    };
    pc.ontrack = (e) => {
      const stream = (e.streams && e.streams[0]) ? e.streams[0] : null;
      // eslint-disable-next-line no-console
      console.log("[webrtc] ontrack received stream:", stream?.id, "tracks:", stream?.getTracks().length, "track:", e.track?.kind);
      if (stream) {
        setRemoteStream(stream);
        return;
      }
      // Some browsers may deliver tracks without streams; synthesize a MediaStream.
      setRemoteStream((prev) => {
        const next = prev ? new MediaStream(prev.getTracks()) : new MediaStream();
        try {
          if (e.track) next.addTrack(e.track);
        } catch {}
        return next;
      });
    };
    pc.oniceconnectionstatechange = () => {
      // eslint-disable-next-line no-console
      console.log("[webrtc] ICE state:", pc.iceConnectionState);
    };
    pc.onconnectionstatechange = () => {
      // eslint-disable-next-line no-console
      console.log("[webrtc] Connection state:", pc.connectionState);
    };
    // Add local tracks
    const local = videoStreamRef.current || audioStreamRef.current;
    // eslint-disable-next-line no-console
    console.log("[webrtc] Adding local tracks:", local?.getTracks().length || 0);
    if (local) for (const track of local.getTracks()) pc.addTrack(track, local);
    pcRef.current = pc;
    // eslint-disable-next-line no-console
    console.log("[webrtc] Peer connection created");
  };

  const startCallWithPeer = async (kind: "video" | "voice") => {
    try {
      if (!baseUrl || !activeChannelId) return;
      // eslint-disable-next-line no-console
      console.log("[webrtc] startCallWithPeer called");
      const { getSocket } = await import("@/lib/socket");
      const s = await getSocket(baseUrl);
      setInCall(true);
      setCallKind(kind);
      setMicOn(true);
      setCamOn(kind === "video");
      await ensureLocalForKind(kind);
      // eslint-disable-next-line no-console
      console.log("[webrtc] After ensureLocal, creating peer connection...");
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
      if (videoStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoStreamRef.current = stream;
      setVideoStream(stream);
    } catch {}
  };
  const stopVideo = () => {
    try {
      for (const tr of videoStreamRef.current?.getTracks?.() || []) tr.stop();
    } catch {}
    videoStreamRef.current = null;
    setVideoStream(null);
  };
  const startAudio = async () => {
    try {
      if (audioStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = stream;
      setAudioStream(stream);
    } catch {}
  };
  const stopAudio = () => {
    try {
      for (const tr of audioStreamRef.current?.getTracks?.() || []) tr.stop();
    } catch {}
    audioStreamRef.current = null;
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
      <audio ref={remoteAudioElRef} autoPlay playsInline />
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setActive(null)} className="md:hidden mr-1 text-[color:var(--brand)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="h-[36px] w-[36px] rounded-full overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface-2)]">
            {active?.kind === 'dm' && lastOtherAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={normalizeAvatar(lastOtherAvatar)!} alt="User" className="h-full w-full object-cover" />
            ) : active?.kind !== 'dm' && active?.name ? (
              <div className="h-full w-full grid place-items-center text-[color:var(--brand)] font-bold text-sm">
                {active.name.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="h-full w-full grid place-items-center text-[color:var(--muted)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold text-[color:var(--foreground)] text-[15px]">{active?.name ?? "Chat"}</span>
              {active?.kind === 'dm' && activeOtherIsTeacher && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-[1px] text-[9px] font-bold uppercase tracking-wider text-blue-600">
                  Teacher
                </span>
              )}
            </div>
            <div className="text-[12px] text-[color:var(--muted-2)] truncate">{active?.kind === 'dm' ? 'Active now' : (active?.topic ?? '')}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {canStartCall && (
            <>
              <button
                onClick={async () => {
                  try {
                    if (!activeChannelId || !baseUrl) return;
                    const { getSocket, joinRoom } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    await joinRoom(baseUrl, activeChannelId);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "voice", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("voice");
                  } catch {}
                }}
                className="text-[color:var(--brand)] hover:opacity-80 transition-opacity" title="Call">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1.02 1.02 0 0 0-1.02.24l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1zM19 12h2a9 9 0 0 0-9-9v2c3.87 0 7 3.13 7 7zm-4 0h2c0-2.76-2.24-5-5-5v2c1.66 0 3 1.34 3 3z"/></svg>
              </button>
              <button
                onClick={async () => {
                  try {
                    if (!activeChannelId || !baseUrl) return;
                    const { getSocket, joinRoom } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    await joinRoom(baseUrl, activeChannelId);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "video", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("video");
                  } catch {}
                }}
                className="text-[color:var(--brand)] hover:opacity-80 transition-opacity" title="Video">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
              </button>
            </>
          )}
          <button onClick={() => setShowMore((v) => !v)} className="text-[color:var(--brand)] hover:opacity-80 transition-opacity" title="More">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>
          </button>
        </div>
      </div>
      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between px-4 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-[40px] w-[40px] rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] overflow-hidden grid place-items-center">
            {active?.kind === 'dm' && lastOtherAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={normalizeAvatar(lastOtherAvatar)!} alt={active?.name || "User"} className="h-full w-full object-cover" />
            ) : active?.name ? (
              <div className="h-full w-full grid place-items-center text-[color:var(--brand)] font-bold text-sm">
                {active.name.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="text-[color:var(--muted)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold text-[color:var(--foreground)] text-[15px]">{active?.name ?? "Chat"}</span>
              {active?.kind === 'dm' && activeOtherIsTeacher && (
                <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-[1px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">
                  Teacher
                </span>
              )}
            </div>
            <div className="text-[13px] text-[color:var(--muted-2)] truncate">{active?.kind === 'dm' ? 'Online' : (active?.topic ?? '')}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[color:var(--brand)]">
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
                    const { getSocket, joinRoom } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    await joinRoom(baseUrl, activeChannelId);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "video", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("video");
                  } catch {}
                }}
                className="hover:opacity-80 transition-opacity" title="Video">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
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
                    const { getSocket, joinRoom } = await import("@/lib/socket");
                    const socket = await getSocket(baseUrl);
                    await joinRoom(baseUrl, activeChannelId);
                    socket.emit("call:invite", { channelId: activeChannelId, kind: "voice", from: displayName || "You", fromSocketId: socket.id, fromUserId: userId || undefined });
                    await startCallWithPeer("voice");
                  } catch {}
                }}
                className="hover:opacity-80 transition-opacity" title="Call">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1.02 1.02 0 0 0-1.02.24l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1zM19 12h2a9 9 0 0 0-9-9v2c3.87 0 7 3.13 7 7zm-4 0h2c0-2.76-2.24-5-5-5v2c1.66 0 3 1.34 3 3z"/></svg>
              </button>
            </>
          )}
          <button onClick={() => setShowMore((v) => !v)} className="hover:opacity-80 transition-opacity" title="More">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/></svg>
          </button>
        </div>
      </div>

      <div ref={listRef} className="relative flex-1 overflow-y-auto custom-scroll" style={{padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '2px'}}>
        {!isOnline && (
          <div className="sticky top-0 z-20 mx-[-12px] mt-[-16px] mb-4 bg-orange-600/90 backdrop-blur-md text-white text-[11px] font-bold py-2 px-4 flex items-center justify-center gap-2 animate-pulse shadow-md rounded-b-xl border-b border-white/20">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            OFFLINE MODE - Your messages are safely queued for sync
          </div>
        )}
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
                className="rounded-md border border-orange-300/60 bg-orange-500/15 hover:bg-orange-500/25 px-2 py-1 text-xs text-[color:var(--foreground)]"
                onClick={() => setShowPinnedList(true)}
              >View all ({currentPins.length})</button>
              <button
                className="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-semibold tracking-wide text-white bg-gradient-to-b from-[var(--brand-2)] to-[var(--brand)] shadow-[0_14px_30px_-20px_rgba(234,88,12,0.60),0_0_0_1px_rgba(234,88,12,0.35)_inset] hover:brightness-[1.01] active:brightness-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
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
                    <div className="h-[28px] w-[28px] rounded-full mr-2 overflow-hidden bg-[color:var(--surface-2)] shrink-0 self-end mb-1">
                      {normalizeAvatar(m.senderAvatarUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={normalizeAvatar(m.senderAvatarUrl)!} alt={m.senderName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-[color:var(--muted)]">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`relative group ${isImageUrl(m.text ?? '') ? 'max-w-[75%]' : 'max-w-[70%]'} rounded-[20px] overflow-hidden ${mine ? "bg-[color:var(--brand)] text-white" : "bg-[color:var(--surface-2)] text-[color:var(--foreground)]"} ${m.status === 'pending' ? 'opacity-[0.6] scale-[0.98]' : ''} transition-all`}>
                    <button
                      type="button"
                      className={`absolute top-1 right-1 z-10 hidden group-hover:flex items-center justify-center h-6 w-6 rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/60 transition-colors`}
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
                        <img src={normalizeAttachment(m.text)!} alt={m.context?.meta?.filename || "attachment"} className="block w-full max-w-[260px] object-cover" style={{maxHeight: '260px'}} />
                      ) : (
                        <div className="px-3.5 py-2">
                          <a href={normalizeAttachment(m.text) || '#'} target="_blank" rel="noreferrer" className="underline break-all text-sm">
                            {m.context?.meta?.filename || m.text.split('/').pop() || m.text}
                          </a>
                        </div>
                      )
                    ) : (
                      <div className="px-3.5 py-2 text-sm whitespace-pre-wrap break-words">{m.text}</div>
                    )}
                  </div>
                  {mine && (
                    <div className="h-8 w-8 rounded-full bg-white/5 border border-white/25 ml-2 overflow-hidden">
                      {normalizeAvatar(avatarUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={normalizeAvatar(avatarUrl)!} alt="Me" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-[color:var(--foreground)]/60">?</div>
                      )}
                    </div>
                  )}
                </div>
                {m.context ? (
                  isImageMessage(m)
                    ? <SmartContextCardCompact context={m.context} align={mine ? "right" : "left"} />
                    : <SmartContextCard context={m.context} align={mine ? "right" : "left"} />
                ) : null}
                {/* Meta row: time and tiny avatar-as-seen for own messages */}
                <div className={`flex items-center ${mine ? "justify-end" : "justify-start"} gap-2 px-10 md:px-16`}>
                  <div className="text-[10px] opacity-70">{timeFmt.format(new Date(m.createdAt))}</div>
                  {mine && (
                    <div className="flex items-center gap-1.5 ml-1">
                      {m.status === 'pending' ? (
                        <>
                          <div className="h-2.5 w-2.5 rounded-full border border-[color:var(--brand)] border-t-transparent animate-spin" />
                          <span className="text-[9px] font-bold text-[color:var(--brand)] uppercase tracking-tight">sending...</span>
                        </>
                      ) : m.status === 'sent' ? (
                        <>
                          <div className="flex items-center h-2.5 w-2.5 rounded-full bg-[color:var(--brand)] shadow-sm">
                            <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                          <span className="text-[9px] font-bold text-[color:var(--brand)] opacity-80 uppercase tracking-tight">sent</span>
                        </>
                      ) : null}
                    </div>
                  )}
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
          <div className="flex-1 flex items-center justify-center text-sm text-[color:var(--muted)] text-center py-8">No messages here yet. Say hello! 👋</div>
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || !activeChannelId) return;
          const body = text.trim();
          const msgId = send(activeChannelId, body);

          if (baseUrl) {
            try {
              const { getSocket, joinRoom } = await import("@/lib/socket");
              const socket = await getSocket(baseUrl);
              if (!socket.connected) {
                try {
                  await new Promise<void>((resolve, reject) => {
                    const t = setTimeout(() => reject(new Error("connect_timeout")), 2000);
                    socket.once("connect", () => { clearTimeout(t); resolve(); });
                    socket.connect();
                  });
                } catch {}
              }
              try { await joinRoom(baseUrl, activeChannelId); } catch {}
              socket.emit("message:send", {
                id: msgId,
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
        className="border-t border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] shrink-0"
      >
        {/* Voice recording UI */}
        {isRecording ? (
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Pulsing dot */}
            <div className="relative flex items-center justify-center h-10 w-10 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40 animate-ping" />
              <span className="inline-flex h-4 w-4 rounded-full bg-red-500" />
            </div>
            {/* Timer */}
            <div className="flex-1">
              <div className="text-sm font-semibold text-[color:var(--foreground)]">Recording…</div>
              <div className="text-xs text-red-500 font-mono">
                {`${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')}`}
              </div>
            </div>
            {/* Cancel */}
            <button
              type="button"
              onClick={() => {
                try {
                  if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
                  if (recordingAutoStopRef.current) clearTimeout(recordingAutoStopRef.current);
                  if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    // Override onstop so it discards the recording
                    mediaRecorderRef.current.onstop = () => {
                      recordingStreamRef.current?.getTracks().forEach(t => t.stop());
                      recordingStreamRef.current = null;
                      mediaRecorderRef.current = null;
                      recordingChunksRef.current = [];
                    };
                    mediaRecorderRef.current.stop();
                  } else {
                    recordingStreamRef.current?.getTracks().forEach(t => t.stop());
                    recordingStreamRef.current = null;
                    mediaRecorderRef.current = null;
                    recordingChunksRef.current = [];
                  }
                } catch {}
                setIsRecording(false);
                setRecordingSeconds(0);
              }}
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[color:var(--muted)] bg-[color:var(--surface-2)] hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Cancel"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            {/* Send */}
            <button
              type="button"
              onClick={async () => {
                try {
                  if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
                  if (recordingAutoStopRef.current) clearTimeout(recordingAutoStopRef.current);
                  const recorder = mediaRecorderRef.current;
                  if (!recorder || recorder.state === 'inactive') return;
                  // Set the real onstop handler then stop
                  recorder.onstop = async () => {
                    recordingStreamRef.current?.getTracks().forEach(t => t.stop());
                    recordingStreamRef.current = null;
                    const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
                    recordingChunksRef.current = [];
                    mediaRecorderRef.current = null;
                    if (!activeChannelId) return;
                    const form = new FormData();
                    form.append('file', blob, `voice-${Date.now()}.webm`);
                    const base = (baseUrl || `http://${window.location.hostname}:4000`).replace(/\/$/, '');
                    try {
                      const resp = await fetch(`${base}/upload/file`, { method: 'POST', body: form });
                      if (!resp.ok) return;
                      const data = await resp.json();
                      const path = typeof data?.url === 'string' ? data.url : null;
                      if (!path) return;
                      const msgId = send(activeChannelId, path);
                      if (baseUrl) {
                        try {
                          const { getSocket, joinRoom } = await import('@/lib/socket');
                          const socket = await getSocket(baseUrl);
                          try { await joinRoom(baseUrl, activeChannelId); } catch {}
                          socket.emit('message:send', {
                            id: msgId,
                            channelId: activeChannelId,
                            text: path,
                            senderName: displayName || 'You',
                            senderAvatarUrl: avatarUrl || null,
                            senderId: userId || undefined,
                          });
                        } catch {}
                      }
                    } catch {}
                  };
                  recorder.stop();
                } catch {}
                setIsRecording(false);
                setRecordingSeconds(0);
              }}
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-[color:var(--brand)] text-white hover:opacity-90 transition-opacity"
              title="Send voice message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5">
            {/* Plus / attach file */}
            <button type="button" onClick={() => fileInputRef.current?.click()} className="h-8 w-8 shrink-0 flex items-center justify-center text-[color:var(--brand)] hover:opacity-80 transition-opacity" title="Attach file">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
            </button>

            {/* Image attach */}
            <button type="button" onClick={() => fileInputRef.current?.click()} className="h-8 w-8 shrink-0 flex items-center justify-center text-[color:var(--brand)] hover:opacity-80 transition-opacity" title="Attach image">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            </button>

            {/* Text input pill */}
            <div className="flex-1 bg-[color:var(--surface-2)] rounded-[20px] px-3 py-1.5 flex items-center">
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
                placeholder="Aa"
                className="flex-1 bg-transparent border-none outline-none resize-none text-[15px] placeholder-[color:var(--muted)] py-[4px] min-h-[28px] max-h-[100px] overflow-y-auto custom-scroll"
              />
            </div>

            {/* Send OR mic */}
            {text.trim() ? (
              <button type="submit" className="h-8 w-8 shrink-0 flex items-center justify-center text-[color:var(--brand)] hover:opacity-80 transition-opacity" title="Send">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            ) : (
              <button
                type="button"
                title="Voice message"
                className="h-8 w-8 shrink-0 flex items-center justify-center text-[color:var(--brand)] hover:opacity-80 transition-opacity"
                onClick={async () => {
                  if (!activeChannelId) {
                    alert('Please open a chat first.');
                    return;
                  }
                  if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
                    alert('Voice recording is not supported on this browser.');
                    return;
                  }
                  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    alert('Microphone access requires a secure connection (HTTPS). Voice messages are not available on HTTP.');
                    return;
                  }
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    recordingStreamRef.current = stream;
                    recordingChunksRef.current = [];
                    // Pick best supported MIME
                    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                      ? 'audio/webm;codecs=opus'
                      : MediaRecorder.isTypeSupported('audio/webm')
                      ? 'audio/webm'
                      : MediaRecorder.isTypeSupported('audio/ogg')
                      ? 'audio/ogg'
                      : '';
                    const recorder = mimeType
                      ? new MediaRecorder(stream, { mimeType })
                      : new MediaRecorder(stream);
                    recorder.ondataavailable = (ev) => {
                      if (ev.data && ev.data.size > 0) recordingChunksRef.current.push(ev.data);
                    };
                    mediaRecorderRef.current = recorder;
                    recorder.start(100);
                    setIsRecording(true);
                    setRecordingSeconds(0);
                    recordingTimerRef.current = setInterval(() => {
                      setRecordingSeconds(s => s + 1);
                    }, 1000);
                    recordingAutoStopRef.current = setTimeout(() => {
                      try {
                        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                          mediaRecorderRef.current.stop();
                        }
                      } catch {}
                      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
                      setIsRecording(false);
                      setRecordingSeconds(0);
                    }, 120000);
                  } catch (err: any) {
                    setIsRecording(false);
                    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
                      alert('Microphone permission denied. Please allow microphone access in your browser settings and try again.');
                    } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
                      alert('No microphone found. Please connect a microphone and try again.');
                    } else {
                      alert('Could not start recording: ' + (err?.message || String(err)));
                    }
                  }
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.81 6.43 6.32 6.92v3.08h1.36v-3.08C16.19 17.43 19 14.53 19 11h-2z"/></svg>
              </button>
            )}
          </div>
        )}
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
              const contextPayload = (data && typeof data === "object" ? (data as any).context : null) as any;
              // Optimistic UI
              send(
                activeChannelId,
                textToSend,
                (contextPayload && typeof contextPayload === "object")
                  ? contextPayload
                  : {
                      summary: `${metaFilename} (${formatBytesReadable(metaSize)}) was shared.`,
                      highlights: [],
                      suggestions: [],
                      tagline: "Smart Contextual Messaging",
                      meta: metaPayload,
                    }
              );

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
                    context: (contextPayload && typeof contextPayload === "object") ? contextPayload : undefined,
                  });
                } catch {}
              }
              // clear input
              e.currentTarget.value = "";
            } catch {}
          }}
        />
      </form>

      {messageMenu && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[70]" onClick={() => setMessageMenu(null)}>
          <div
            className="absolute w-[190px] rounded-xl border border-white/15 bg-white/80 backdrop-blur-xl shadow-xl divide-y divide-white/10"
            style={{ left: `${Math.max(8, messageMenu.x - 180)}px`, top: `${messageMenu.y + 8}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm"
              onClick={async () => {
                if (!activeChannelId || !baseUrl || !messageMenu.id) return;
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
                  if (!activeChannelId || !baseUrl || !messageMenu.id) return;
                  try {
                    const token = getToken();
                    await fetch(`${baseUrl.replace(/\/$/, "")}/channels/${activeChannelId}/pin?messageId=${encodeURIComponent(messageMenu.id)}`, {
                      method: "DELETE",
                      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    });
                  } catch {}
                  setMessageMenu(null);
                }}
              >
                <span className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-white bg-gradient-to-b from-[var(--brand-2)] to-[var(--brand)] shadow-[0_14px_30px_-20px_rgba(234,88,12,0.60),0_0_0_1px_rgba(234,88,12,0.35)_inset]">
                  Unpin
                </span>
              </button>
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
          <div className="absolute right-3 top-[120px] md:right-8 md:top-[120px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-[color:var(--foreground)]/80 text-sm">Start voice call</div>
              <button className="text-[11px] text-[color:var(--foreground)]/60 hover:text-[color:var(--foreground)]" onClick={() => { setShowCall(false); stopAudio(); }}>Close</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="rounded-xl border border-white/20 bg-[color:var(--surface)]/70 p-3">
                <div className="mt-1 flex gap-2 items-center">
                  <button
                    className="ml-auto rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-[color:var(--foreground)]"
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
          <div className="absolute right-3 top-[140px] md:right-8 md:top-[140px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-[color:var(--foreground)]/80 text-sm">Incoming {incomingCall.kind === 'video' ? 'video' : 'voice'} call</div>
              <button className="text-[11px] text-[color:var(--foreground)]/60 hover:text-[color:var(--foreground)]" onClick={() => setIncomingCall(null)}>Dismiss</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="text-[color:var(--foreground)]/70 text-sm">{incomingCall.from || 'Someone'} is calling you.</div>
              <div className="flex gap-2 justify-end">
                <button
                  className="rounded-lg border border-red-600/40 bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs text-white"
                  onClick={() => setIncomingCall(null)}
                >Decline</button>
                <button
                  className="rounded-lg border border-emerald-700/40 bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs text-white"
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
                      // eslint-disable-next-line no-console
                      console.log("[webrtc] Accept: creating peer connection");
                      await createPeerConnection(s);
                      peerSocketIdRef.current = fromSocketId || null;
                      // Notify caller that we're ready to receive offer
                      // eslint-disable-next-line no-console
                      console.log("[webrtc] Emitting call:accept to:", fromSocketId);
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
          <div className="absolute right-3 bottom-3 md:right-8 md:bottom-8 w-[92%] md:w-[680px] rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl shadow-xl p-3">
            <div className="flex items-center gap-2 justify-between mb-2">
              <div className="text-[color:var(--foreground)]/80 text-sm truncate">{callKind === 'video' ? 'Video call' : 'Voice call'}</div>
              <div className="flex items-center gap-2">
                <button onClick={endCall} className="h-8 px-3 rounded-md border border-red-600/40 bg-red-600 hover:bg-red-700 text-xs text-white">End</button>
              </div>
            </div>
            {callKind === "voice" ? (
              <div className="rounded-xl border border-white/15 bg-[color:var(--surface)]/70 p-4 min-h-[160px] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-sm text-[color:var(--foreground)]/80">Voice call in progress</div>
                  <div className="mt-2 text-xs text-[color:var(--foreground)]/55">Microphone: {micOn ? "On" : "Off"}</div>
                </div>
              </div>
            ) : (
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
                    ref={remoteVideoElRef}
                  />
                </div>
              </div>
            )}
          </div>
        </div>, document.body) : null}

      {showMore && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
          <div className="absolute right-3 top-[100px] md:right-8 md:top-[100px] w-[92%] md:w-[320px] rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-[color:var(--foreground)]/80 text-sm">More</div>
              <button className="text-[11px] text-[color:var(--foreground)]/60 hover:text-[color:var(--foreground)]" onClick={() => setShowMore(false)}>Close</button>
            </div>
            <div className="divide-y divide-white/10">
              <button
                className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm text-[color:var(--foreground)]"
                onClick={() => {
                  if (activeChannelId) {
                    setActive(activeChannelId); // clears unread for active via store logic
                  }
                  setShowMore(false);
                }}
              >Mark as read</button>
              <button
                className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm text-[color:var(--foreground)]"
                onClick={() => {
                  setShowPinnedList(true);
                  setShowMore(false);
                }}
              >Pinned messages ({currentPins.length})</button>
              <button
                className="w-full text-left px-3 py-3 hover:bg-white/10 text-sm text-[color:var(--foreground)]"
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
          <div className="absolute right-3 top-[120px] md:right-8 md:top-[120px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-[color:var(--foreground)]/80 text-sm">Channel info</div>
              <button className="text-[11px] text-[color:var(--foreground)]/60 hover:text-[color:var(--foreground)]" onClick={() => setShowInfo(false)}>Close</button>
            </div>
            {(() => {
              const ch = channels.find(c => c.id === activeChannelId);
              return (
                <div className="p-3 space-y-2 text-sm text-[color:var(--foreground)]/80">
                  <div className="flex items-center justify-between gap-3"><div className="text-[color:var(--foreground)]/55">Name</div><div className="truncate">{ch?.name || ""}</div></div>
                  <div className="flex items-center justify-between gap-3"><div className="text-[color:var(--foreground)]/55">Type</div><div className="truncate capitalize">{ch?.kind || ""}</div></div>
                  {ch?.kind !== "section-group" ? (
                    <div className="flex items-center justify-between gap-3"><div className="text-[color:var(--foreground)]/55">Topic</div><div className="truncate">{ch?.topic || ""}</div></div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3"><div className="text-[color:var(--foreground)]/55">ID</div><div className="truncate">{ch?.id || ""}</div></div>

                  {ch?.kind === "section-group" ? (
                    <div className="pt-2 space-y-3">
                      <div className="text-[color:var(--foreground)]/60 text-xs uppercase tracking-[0.24em]">Members</div>
                      {infoLoading ? (
                        <div className="text-[color:var(--foreground)]/60">Loading…</div>
                      ) : infoError ? (
                        <div className="text-red-300">{infoError}</div>
                      ) : (
                        <div className="max-h-[180px] overflow-y-auto custom-scroll rounded-xl border border-white/10 bg-[color:var(--surface)]">
                          {(groupMembers || []).map((m) => (
                            <div key={m.id} className="px-3 py-2 border-b border-white/10 last:border-b-0 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[color:var(--foreground)]/90 truncate">{m.name}</div>
                                <div className="text-xs text-[color:var(--foreground)]/50 truncate">{m.email}</div>
                              </div>
                              {m.isTeacher ? (
                                <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-[2px] text-[9px] uppercase tracking-[0.22em] text-emerald-200">Teacher</span>
                              ) : null}
                            </div>
                          ))}
                          {(!groupMembers || groupMembers.length === 0) ? (
                            <div className="px-3 py-3 text-[color:var(--foreground)]/60">No members.</div>
                          ) : null}
                        </div>
                      )}

                      {canManageGroup ? (
                        <div className="space-y-2">
                          <div className="text-[color:var(--foreground)]/60 text-xs uppercase tracking-[0.24em]">Manage</div>
                          <div className="flex items-center gap-2">
                            <input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="flex-1 rounded-xl border border-white/20 bg-[color:var(--surface)] text-[color:var(--foreground)]/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
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
                          <div className="text-xs text-[color:var(--foreground)]/60">This is a legacy group (created before rename/delete existed).</div>
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
                          <div className="text-xs text-[color:var(--foreground)]/50">Only members can claim. First claim wins.</div>
                        </div>
                      ) : (
                        <div className="text-xs text-[color:var(--foreground)]/50">Only the group creator can rename or delete this group.</div>
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
          <div className="absolute right-3 top-[140px] md:right-8 md:top-[140px] w-[92%] md:w-[420px] rounded-2xl border border-white/20 bg-[color:var(--surface)] backdrop-blur-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-[color:var(--foreground)]/80 text-sm">Pinned messages</div>
              <button className="text-[11px] text-[color:var(--foreground)]/60 hover:text-[color:var(--foreground)]" onClick={() => setShowPinnedList(false)}>Close</button>
            </div>
            <div className="p-3 space-y-3 text-sm text-[color:var(--foreground)]/80">
              {currentPins.length > 0 ? (
                <div className="space-y-3">
                  {currentPins.map((pin) => (
                    <div key={pin.id} className="rounded-xl border border-white/15 bg-[color:var(--surface)] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-[color:var(--foreground)]/90 truncate">{pin.message?.senderName || "Unknown"}</div>
                          <div className="text-[color:var(--foreground)]/70 whitespace-pre-wrap break-words">{pin.message?.text || "(attachment)"}</div>
                          <div className="text-xs text-[color:var(--foreground)]/50">
                            Pinned by {pin.pinnedByName || "Someone"}
                            {pin.pinnedAt ? ` • ${new Date(pin.pinnedAt).toLocaleString()}` : ""}
                          </div>
                        </div>
                        <button
                          className="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-semibold tracking-wide text-white bg-gradient-to-b from-[var(--brand-2)] to-[var(--brand)] shadow-[0_14px_30px_-20px_rgba(234,88,12,0.60),0_0_0_1px_rgba(234,88,12,0.35)_inset] hover:brightness-[1.01] active:brightness-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
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
                <div className="text-[color:var(--foreground)]/60">No pinned messages yet.</div>
              )}
            </div>
          </div>
        </div>, document.body) : null}
    </div>
  );
}
