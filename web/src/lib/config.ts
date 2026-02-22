// Prefer explicit env; otherwise infer LAN server from the current host so phones on the same Wi‑Fi work.
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  (typeof window !== "undefined"
    ? `http://${window.location.hostname}:4000`
    : "http://localhost:4000");
