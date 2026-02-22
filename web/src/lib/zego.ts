"use client";

import type { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";

export type ZegoMode = "video" | "voice";

function getFromStorage(key: string): string | null {
  try { return typeof window !== "undefined" ? localStorage.getItem(key) : null; } catch { return null; }
}

async function fetchProductionToken(userId: string): Promise<string | null> {
  // Try a custom token server URL from localStorage (e.g. https://nextjs-token.vercel.app/api)
  try {
    const tokenServer = getFromStorage('chatbox.zego.tokenServer');
    if (tokenServer) {
      const url = `${tokenServer.replace(/\/$/, '')}/access_token?userID=${encodeURIComponent(userId)}&expired_ts=7200`;
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const json = await res.json();
        const token = json?.token || json?.data?.token || json?.access_token || null;
        if (typeof token === 'string') return token;
      }
    }
  } catch {}
  return null;
}

export async function mountZegoCall(params: {
  appId?: number;
  appSign?: string; // treated as serverSecret for backwards compatibility
  roomId: string;
  userId: string;
  userName: string;
  mode: ZegoMode;
  container: HTMLElement;
}): Promise<ZegoUIKitPrebuilt | null> {
  const { roomId, userId, userName, mode, container } = params;
  if (!container) return null;
  const { ZegoUIKitPrebuilt } = await import("@zegocloud/zego-uikit-prebuilt");
  const appId = params.appId ?? Number(process.env.NEXT_PUBLIC_ZEGO_APP_ID || getFromStorage('chatbox.zego.appId') || 1778055439);
  const defaultServerSecret = "2bf003da47e01aad284b04e04b7854fe";
  let serverSecret =
    params.appSign // legacy prop
    ?? process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET
    ?? getFromStorage('chatbox.zego.serverSecret')
    ?? getFromStorage('chatbox.zego.appSign')
    ?? defaultServerSecret;
  // Guard against mistakenly using AppSign value (from old setup)
  if (!serverSecret || serverSecret === "8224a1937c39e9895e39cf4a101c906c778a699e117dff990a08c87919f01494") {
    serverSecret = defaultServerSecret;
  }

  // Prefer production token flow if a token server or backend is available
  let kitToken: string | null = null;
  const prodToken = await fetchProductionToken(userId);
  if (prodToken) {
    kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(appId, prodToken, roomId, userId, userName);
  } else {
    // Dev-only fallback: generate test token with AppSign (insecure for production)
    kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(appId, serverSecret, roomId, userId, userName);
  }
  const kit = ZegoUIKitPrebuilt.create(kitToken);
  const scenario = mode === "video" ? ZegoUIKitPrebuilt.VideoConference : ZegoUIKitPrebuilt.OneONoneCall;
  const showCamera = mode === "video";
  kit.joinRoom({
    container,
    sharedLinks: [],
    turnOnMicrophoneWhenJoining: true,
    turnOnCameraWhenJoining: showCamera,
    showMyCameraToggleButton: showCamera,
    showScreenSharingButton: false,
    showPreJoinView: false,
    maxUsers: 8,
    layout: "Grid",
    scenario: { mode: scenario },
  });
  return kit;
}
