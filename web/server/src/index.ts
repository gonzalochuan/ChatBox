import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const PORT = parseInt(process.env.PORT || "4000", 10);
const BACKEND_URL = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000").replace(/\/$/, "");
const ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",");
const IS_DEV = process.env.NODE_ENV !== "production";

const app = express();
app.use(
  cors({
    origin: IS_DEV ? true : ORIGINS,
    credentials: true,
  })
);
app.use(express.json());

// Simple in-memory stores for MVP
type Channel = { id: string; name: string; topic?: string; kind: string };
interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  priority: "normal" | "high" | "emergency";
}

const channels: Channel[] = [
  { id: "gen", name: "General", topic: "Campus-wide", kind: "subject" },
];
const messages: Record<string, Message[]> = { gen: [] };

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: "lan", ts: Date.now() });
});

app.post("/channels/:id/messages", express.json(), async (req, res) => {
  try {
    const id = req.params.id;
    const r = await fetch(`${BACKEND_URL}/channels/${id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: (req.headers["authorization"] as string) || "",
      },
      body: JSON.stringify(req.body || {}),
    });
    const body = await r.text();
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
  } catch (e) {
    res.status(502).json({ error: "proxy_failed" });
  }
});

app.get("/channels", (_req, res) => {
  res.json({ channels });
});

app.get("/dms", async (req, res) => {
  try {
    const r = await fetch(`${BACKEND_URL}/dms`, {
      headers: { Authorization: (req.headers["authorization"] as string) || "" },
    });
    if (r.ok) {
      const body = await r.text();
      res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
      return;
    }
  } catch {}
  res.json({ dms: [] });
});

app.get("/channels/:id/messages", (req, res) => {
  const id = req.params.id;
  // Try backend first for persisted history
  (async () => {
    try {
      const qs = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
      const r = await fetch(`${BACKEND_URL}/channels/${id}/messages${qs}`, {
        headers: { Authorization: (req.headers["authorization"] as string) || "" },
      });
      if (r.ok) {
        const body = await r.text();
        res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
        return;
      }
    } catch {}
    // Fallback to local in-memory
    const list = messages[id] || [];
    res.json({ messages: list });
  })();
});

// ---- Proxy API to backend so the web app can call via LAN origin ----
function flipPort(url: string): string {
  try {
    const u = new URL(url);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    let next = port;
    if (port === "3000") next = "3001"; else if (port === "3001") next = "3000";
    u.port = next;
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

async function proxyGet(req: express.Request, res: express.Response, path: string) {
  const qs = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const targets = [BACKEND_URL, flipPort(BACKEND_URL)];
  for (const base of targets) {
    try {
      const r = await fetch(`${base}${path}${qs}`, {
        headers: { Authorization: (req.headers["authorization"] as string) || "" },
      });
      if (!r.ok && r.status !== 404 && r.status !== 405) {
        // Non-404/405 errors still return the response
        const body = await r.text();
        return res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
      }
      if (r.status !== 404) {
        const body = await r.text();
        return res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
      }
      // else try next target
    } catch {
      // try next target
    }
  }
  return res.status(404).json({ error: "not_found" });
}

app.get("/users/students", async (req, res) => proxyGet(req, res, "/users/students"));
app.get("/teacher/students", async (req, res) => proxyGet(req, res, "/teacher/students"));

const server = http.createServer(app);
const io = new Server(server, {
  // In LAN mode, allow any origin so phones on the same network can connect
  cors: { origin: true, credentials: true },
  // Serve the Socket.IO client from this server so mobile works without internet
  serveClient: true,
});

io.on("connection", (socket) => {
  // Debug: new connection
  // eslint-disable-next-line no-console
  console.log(`[socket] connected id=${socket.id} from ${socket.handshake.address}`);
  const joined = new Set<string>();
  socket.on("join", (channelId: string) => {
    if (!channelId) return;
    socket.join(channelId);
    joined.add(channelId);
    // eslint-disable-next-line no-console
    console.log(`[socket] ${socket.id} joined room ${channelId}`);
    io.to(channelId).emit("presence", { channelId, userId: socket.id, name: "User", online: true, ts: Date.now() });
  });

  socket.on("message:send", (payload: { channelId: string; text: string; senderId?: string; senderName?: string; senderAvatarUrl?: string | null; priority?: Message["priority"]; }) => {
    // Debug: inbound message
    // eslint-disable-next-line no-console
    console.log(`[socket] message:send from=${socket.id} ch=${payload.channelId} text=${JSON.stringify(payload.text)}`);
    const msg: Message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId: payload.channelId,
      senderId: payload.senderId || socket.id,
      senderName: payload.senderName || "User",
      text: payload.text,
      createdAt: Date.now(),
      priority: payload.priority || "normal",
    };
    // @ts-ignore - extend in-memory Message with avatar for LAN broadcast
    (msg as any).senderAvatarUrl = payload.senderAvatarUrl || null;
    if (!messages[msg.channelId]) messages[msg.channelId] = [];
    messages[msg.channelId].push(msg);
    io.to(msg.channelId).emit("message:new", msg);
    // Debug: broadcasted
    // eslint-disable-next-line no-console
    console.log(`[socket] message:new broadcast to room ${msg.channelId}`);
  });

  socket.on("typing", (p: { channelId: string; userId?: string; name?: string; isTyping?: boolean }) => {
    if (!p || !p.channelId) return;
    io.to(p.channelId).emit("typing", {
      channelId: p.channelId,
      userId: p.userId || socket.id,
      name: p.name || "User",
      isTyping: !!p.isTyping,
      ts: Date.now(),
    });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`LAN server listening on http://0.0.0.0:${PORT}`);
});
