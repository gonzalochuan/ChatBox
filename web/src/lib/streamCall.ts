import { StreamVideoClient, type User, type Call, type StreamVideoParticipant } from '@stream-io/video-client';

let client: StreamVideoClient | null = null;

function getEnv(key: string): string | null {
  try {
    // Next.js exposes NEXT_PUBLIC_*
    const v = (process as any)?.env?.[key];
    if (v) return String(v);
  } catch {}
  return null;
}

function getFromStorage(key: string): string | null {
  try { return typeof window !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; }
}

export async function initStreamClient(params?: { apiKey?: string; token?: string; userId?: string; displayName?: string | null; }): Promise<StreamVideoClient> {
  if (client) return client;
  const apiKey = params?.apiKey || getEnv('NEXT_PUBLIC_STREAM_API_KEY') || getFromStorage('chatbox.stream.apiKey') || 'mmhfdzb5evj2';
  const token = params?.token || getEnv('NEXT_PUBLIC_STREAM_TOKEN') || getFromStorage('chatbox.stream.token') || '';
  const userId = params?.userId || getFromStorage('chatbox.stream.userId') || 'Nimble_Chasmosaurus';
  const user: User = { id: userId, name: params?.displayName || getFromStorage('chatbox.stream.userName') || userId };
  if (!token) {
    throw new Error('STREAM_TOKEN_MISSING');
  }
  client = new StreamVideoClient({ apiKey, token, user });
  return client;
}

export async function getCallForChannel(channelId: string, type: string = 'default'): Promise<Call> {
  if (!channelId) throw new Error('channelId required');
  const c = await initStreamClient();
  const callId = channelId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default_call';
  return c.call(type, callId);
}

// Basic participant rendering helpers (vanilla DOM)
const videoBindings = new Map<string, Function | undefined>();
const videoTracking = new Map<string, Function | undefined>();
const audioBindings = new Map<string, Function | undefined>();

export function bindParticipantElements(call: Call, participant: StreamVideoParticipant, parent: HTMLElement) {
  // audio (remote only)
  if (!participant.isLocalParticipant) {
    const aid = `audio-${participant.sessionId}`;
    let audioEl = document.getElementById(aid) as HTMLAudioElement | null;
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = aid;
      audioEl.dataset.sessionId = participant.sessionId;
      parent.appendChild(audioEl);
      const unbind = call.bindAudioElement(audioEl, participant.sessionId);
      audioBindings.set(aid, unbind);
    }
  }
  // video
  const vid = `video-${participant.sessionId}`;
  let videoEl = document.getElementById(vid) as HTMLVideoElement | null;
  if (!videoEl) {
    videoEl = document.createElement('video');
    videoEl.id = vid;
    videoEl.dataset.sessionId = participant.sessionId;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    //videoEl.muted = participant.isLocalParticipant; // local muted
    videoEl.style.setProperty('object-fit', 'cover');
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    parent.appendChild(videoEl);
    const untrack = call.trackElementVisibility(videoEl, participant.sessionId, 'videoTrack');
    videoTracking.set(vid, untrack);
    const unbind = call.bindVideoElement(videoEl, participant.sessionId, 'videoTrack');
    videoBindings.set(vid, unbind);
  }
}

export function cleanupParticipant(sessionId: string) {
  const vid = `video-${sessionId}`;
  const aid = `audio-${sessionId}`;
  const unbindVideo = videoBindings.get(vid); if (unbindVideo) { try { unbindVideo(); } catch {} videoBindings.delete(vid); }
  const untrackVideo = videoTracking.get(vid); if (untrackVideo) { try { untrackVideo(); } catch {} videoTracking.delete(vid); }
  const unbindAudio = audioBindings.get(aid); if (unbindAudio) { try { unbindAudio(); } catch {} audioBindings.delete(aid); }
  const vEl = document.getElementById(vid); if (vEl && vEl.parentElement) vEl.parentElement.removeChild(vEl);
  const aEl = document.getElementById(aid); if (aEl && aEl.parentElement) aEl.parentElement.removeChild(aEl);
}

export async function leaveAndCleanup(call: Call, container: HTMLElement | null) {
  try { await call.leave(); } catch {}
  if (container) {
    container.querySelectorAll('[data-session-id]').forEach((el) => {
      const sid = (el as HTMLElement).dataset.sessionId || '';
      if (sid) cleanupParticipant(sid);
    });
  }
}
