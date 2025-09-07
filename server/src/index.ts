import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { applyAuthRoutes } from "./auth";
import prisma from "./prisma";
import multer from "multer";
import fs from "fs";
import path from "path";

const PORT = parseInt(process.env.PORT || "4000", 10);
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

// Auth routes (register/login/me)
applyAuthRoutes(app);

// File uploads (avatars)
const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadsDir),
  filename: (_req: any, file: any, cb: any) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = path.extname(file.originalname || "");
    cb(null, `${unique}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

app.post("/upload/avatar", upload.single("avatar"), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: "lan", ts: Date.now() });
});

app.get("/channels", async (_req, res) => {
  // ensure default channel exists
  await prisma.channel.upsert({
    where: { id: "gen" },
    update: {},
    create: { id: "gen", name: "General", topic: "Campus-wide", kind: "subject" },
  });
  const list = await prisma.channel.findMany({ orderBy: { name: "asc" } });
  res.json({ channels: list });
});

app.get("/channels/:id/messages", async (req, res) => {
  const list = await prisma.message.findMany({
    where: { channelId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  // map to epoch ms for frontend compatibility
  res.json({
    messages: list.map((m: any) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId || "",
      senderName: m.senderName,
      senderAvatarUrl: m.senderAvatarUrl || null,
      text: m.text,
      createdAt: m.createdAt.getTime(),
      priority: (m.priority as any) || "normal",
    })),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: IS_DEV ? true : ORIGINS, credentials: true },
});

io.on("connection", (socket) => {
  // Debug: new connection
  // eslint-disable-next-line no-console
  console.log(`[socket] connected id=${socket.id} from ${socket.handshake.address}`);
  socket.on("join", (channelId: string) => {
    socket.join(channelId);
    // Debug: join room
    // eslint-disable-next-line no-console
    console.log(`[socket] ${socket.id} joined room ${channelId}`);
  });

  socket.on("message:send", async (payload: { channelId: string; text: string; senderId?: string; senderName?: string; senderAvatarUrl?: string | null; priority?: "normal" | "high" | "emergency"; }) => {
    try {
      // Debug: inbound message
      // eslint-disable-next-line no-console
      console.log(`[socket] message:send from=${socket.id} ch=${payload.channelId} text=${JSON.stringify(payload.text)}`);
      // Ensure target channel exists to satisfy FK
      await prisma.channel.upsert({
        where: { id: payload.channelId },
        update: {},
        create: { id: payload.channelId, name: payload.channelId, kind: "subject" },
      });
      const created = await prisma.message.create({
        data: {
          channelId: payload.channelId,
          // Only save senderId when the client supplies a real user id
          senderId: payload.senderId ?? null,
          senderName: payload.senderName || "User",
          senderAvatarUrl: payload.senderAvatarUrl || null,
          text: payload.text,
          priority: payload.priority || "normal",
        },
      });
      const msg = {
        id: created.id,
        channelId: created.channelId,
        senderId: created.senderId || "",
        senderName: created.senderName,
        senderAvatarUrl: created.senderAvatarUrl || null,
        text: created.text,
        createdAt: created.createdAt.getTime(),
        priority: (created.priority as any) || "normal",
      };
      io.to(msg.channelId).emit("message:new", msg);
      // Debug: broadcasted
      // eslint-disable-next-line no-console
      console.log(`[socket] message:new broadcast to room ${msg.channelId}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] message:send error", e);
    }
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`LAN server listening on http://0.0.0.0:${PORT}`);
});
