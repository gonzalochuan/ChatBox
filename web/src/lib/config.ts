// Prefer explicit env; otherwise infer LAN server from the current host so phones on the same Wi‑Fi work.
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://chatbox-server-h497.onrender.com"
    : typeof window !== "undefined"
      ? `http://${window.location.hostname}:4000`
      : "http://localhost:4000");

// WebRTC ICE servers configuration
// Supports Twilio TURN credentials via env vars for production reliability
export const ICE_SERVERS: RTCIceServer[] = (() => {
  const servers: RTCIceServer[] = [];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL; // e.g., "turn:global.turn.twilio.com:3478?transport=udp"
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    // Also add STUN from same provider if available
    const stunUrl = process.env.NEXT_PUBLIC_STUN_URL;
    if (stunUrl) servers.push({ urls: stunUrl });
  }
  // Always include Google STUN as fallback
  servers.push({ urls: "stun:stun.l.google.com:19302" });
  return servers;
})();
