import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { applyAuthRoutes } from "./auth.js";
import prisma from "./prisma.js";
import { assignAcademicMemberships, assignSectionMembershipsToStudents, buildSectionId } from "./academic.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";

const PORT = parseInt(process.env.PORT || "4000", 10);
const ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => String(o || "").trim())
  .filter(Boolean);
const IS_DEV = process.env.NODE_ENV !== "production";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "chatbox";
const CLOUDINARY_ENABLED = Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

if (CLOUDINARY_ENABLED) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
}

type UserRecord = Awaited<ReturnType<typeof prisma.user.findMany>>[number];
type UserRoleRecord = Awaited<ReturnType<typeof prisma.userRole.findMany>>[number];
type SubjectEnrollmentRecord = {
  userId: string;
  subjectId: string | null;
};

const app = express();
if (!IS_DEV) {
  app.set("trust proxy", 1);
}
const corsOriginCheck: cors.CorsOptions["origin"] = (origin, cb) => {
  // Allow same-origin, curl/postman, etc.
  if (!origin) return cb(null, true);
  if (IS_DEV) return cb(null, true);

  const o = String(origin || "").trim();
  if (!o) return cb(null, true);

  // Exact allow-list
  if (ORIGINS.includes(o)) return cb(null, true);

  // Allow any Vercel preview/prod domain if explicitly enabled via CORS_ORIGINS
  // e.g. set CORS_ORIGINS to include "vercel" or just rely on exact domain.
  // Here we allow *.vercel.app to prevent breakage when the user changes domains.
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o)) return cb(null, true);

  return cb(null, false);
};

const socketCorsOriginCheck = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
  try {
    if (!origin) return cb(null, true);
    if (IS_DEV) return cb(null, true);
    const o = String(origin || "").trim();
    if (!o) return cb(null, true);
    if (ORIGINS.includes(o)) return cb(null, true);
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o)) return cb(null, true);
    return cb(null, false);
  } catch {
    return cb(null, false);
  }
};

const corsOptions: cors.CorsOptions = {
  origin: corsOriginCheck,
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// Ensure preflight works for all routes (especially uploads)
app.options("*", cors(corsOptions));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "256kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "600", 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

const BANNER_KINDS = new Set(["info", "success", "error"]);
const SMART_CONTEXT_TAGLINE =
  "Smart Contextual Messaging - Highlights urgent messages, filters academic content, and suggests contextual replies to reduce clutter and improve productivity in academic discussions.";
type SmartContext = {
  summary: string;
  highlights: string[];
  suggestions: string[];
  tagline: string;
  meta: {
    filename: string;
    size: number;
    mimetype: string;
  };
};
const ATTACHMENT_CONTEXT_CACHE_MAX = parseInt(process.env.ATTACHMENT_CONTEXT_CACHE_MAX || "2000", 10);
const attachmentContextCache = new Map<string, SmartContext>();
const KEYWORD_GROUPS: Array<{ keywords: string[]; suggestion: string }> = [
  { keywords: ["deadline", "due", "submission", "submit"], suggestion: "Confirm the deadline and share your submission plan." },
  { keywords: ["exam", "test", "quiz"], suggestion: "Acknowledge the assessment and ask about review materials if needed." },
  { keywords: ["meeting", "meet", "schedule"], suggestion: "Confirm availability and clarify the meeting agenda." },
  { keywords: ["project", "assignment", "task"], suggestion: "Clarify deliverables and next steps for the task." },
  { keywords: ["urgent", "important", "immediate"], suggestion: "Respond promptly and prioritize the highlighted concern." },
];

const uploadsDir = path.resolve(process.cwd(), "uploads");
const TEXTUAL_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".log",
  ".xml",
  ".html",
  ".htm",
  ".yml",
  ".yaml",
  ".ini",
  ".cfg",
]);
const TEXTUAL_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/xhtml+xml",
  "application/x-yaml",
]);
const PDF_MIME_TYPES = new Set(["application/pdf"]);
const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".svg"]);
const IMAGE_MIME_PREFIX = "image/";
const PDF_MAX_CHARS = 8000;
const DOCX_MAX_CHARS = 8000;

function normalizeUploadKey(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let key = raw.trim();
  if (!key) return null;
  try {
    const parsed = new URL(key);
    key = parsed.pathname || key;
  } catch {
    // ignore
  }
  const qIndex = key.indexOf("?");
  if (qIndex >= 0) key = key.slice(0, qIndex);
  const hashIndex = key.indexOf("#");
  if (hashIndex >= 0) key = key.slice(0, hashIndex);
  if (key.startsWith("uploads/")) key = `/${key}`;
  if (!key.startsWith("/uploads/")) return null;
  return key.replace(/\\/g, "/");
}

function absoluteUploadPathFromKey(key: string): string | null {
  const relative = key.replace(/^\/?uploads\//, "");
  if (!relative || relative.includes("..")) return null;
  return path.join(uploadsDir, relative);
}

function guessMimeFromName(filename: string): string {
  const ext = path.extname(filename || "").toLowerCase();
  switch (ext) {
    case ".txt":
    case ".md":
    case ".markdown":
    case ".log":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".csv":
    case ".tsv":
      return "text/csv";
    case ".xml":
      return "application/xml";
    case ".yml":
    case ".yaml":
      return "application/x-yaml";
    case ".ini":
    case ".cfg":
      return "text/plain";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function isTextualFile(mimetype: string | null | undefined, filename: string): boolean {
  if (mimetype) {
    if (mimetype.startsWith("text/")) return true;
    if (TEXTUAL_MIME_TYPES.has(mimetype)) return true;
    if (PDF_MIME_TYPES.has(mimetype)) return true;
    if (DOCX_MIME_TYPES.has(mimetype)) return true;
  }
  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".pdf") return true;
  if (ext === ".docx") return true;
  return TEXTUAL_EXTENSIONS.has(ext);
}

function isImageFile(mimetype: string | null | undefined, filename: string): boolean {
  if (mimetype && mimetype.startsWith(IMAGE_MIME_PREFIX)) return true;
  const ext = path.extname(filename || "").toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

async function readFileSample(absPath: string, maxBytes = 256 * 1024): Promise<string> {
  const fileHandle = await fs.promises.open(absPath, "r");
  try {
    const { size } = await fileHandle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await fileHandle.read(buffer, 0, length, 0);
    const text = buffer.toString("utf8");
    return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim();
  } finally {
    await fileHandle.close();
  }
}

async function extractPdfText(absPath: string, maxChars = PDF_MAX_CHARS): Promise<string> {
  const buffer = await fs.promises.readFile(absPath);
  const result = await pdfParse(buffer, { max: maxChars });
  const text = typeof result?.text === "string" ? result.text : "";
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

async function extractDocxText(absPath: string, maxChars = DOCX_MAX_CHARS): Promise<string> {
  const buffer = await fs.promises.readFile(absPath);
  const result = await mammoth.extractRawText({ buffer });
  const text = typeof (result as any)?.value === "string" ? (result as any).value : "";
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function analyzeTextContent(raw: string, fallback: string): { summary: string; highlights: string[]; suggestions: string[] } {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { summary: fallback, highlights: [], suggestions: [] };
  }
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, 3).join(" ").slice(0, 480) || normalized.slice(0, 320);
  const lower = normalized.toLowerCase();
  const highlights: string[] = [];
  const suggestions: string[] = [];
  for (const group of KEYWORD_GROUPS) {
    const hit = group.keywords.find((keyword) => lower.includes(keyword));
    if (!hit) continue;
    suggestions.push(group.suggestion);
    const idx = lower.indexOf(hit);
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(normalized.length, idx + hit.length + 80);
      const snippet = normalized.slice(start, end).trim();
      if (snippet && !highlights.includes(snippet)) {
        highlights.push(snippet);
      }
    }
  }
  if (highlights.length === 0) {
    highlights.push(...sentences.slice(0, 2));
  }
  const uniqueSuggestions = Array.from(new Set(suggestions));
  if (uniqueSuggestions.length === 0) {
    uniqueSuggestions.push("Acknowledge receipt and clarify any next steps needed.");
  }
  return {
    summary,
    highlights: highlights.filter(Boolean).slice(0, 3),
    suggestions: uniqueSuggestions.slice(0, 3),
  };
}

async function emitPinnedUpdate(channelId: string) {
  const pins = await loadPins(channelId);
  const payload = { channelId, pins };
  io.to(channelId).emit("channel:pinned", payload);
  if (channelId.startsWith("dm-")) {
    const parts = channelId.split("-");
    if (parts.length === 3) {
      const a = parts[1];
      const b = parts[2];
      if (a) io.to(`user:${a}`).emit("channel:pinned", payload);
      if (b) io.to(`user:${b}`).emit("channel:pinned", payload);
      if (a) io.to(`dm-${a}`).emit("channel:pinned", payload);
      if (b) io.to(`dm-${b}`).emit("channel:pinned", payload);
    }
  }
}

async function generateSmartContext(cacheKey: string, absPath: string, meta: { filename: string; mimetype: string; size: number }): Promise<SmartContext> {
  if (attachmentContextCache.has(cacheKey)) {
    return attachmentContextCache.get(cacheKey)!;
  }
  const prettySize = formatBytes(meta.size);
  let context: SmartContext;
  const mimetype = meta.mimetype || guessMimeFromName(meta.filename);
  const ext = path.extname(meta.filename || "").toLowerCase();
  const isPdf = PDF_MIME_TYPES.has(mimetype) || ext === ".pdf";
  const isDocx = DOCX_MIME_TYPES.has(mimetype) || ext === ".docx";
  const isImage = isImageFile(mimetype, meta.filename);
  if (isDocx) {
    try {
      const docText = await extractDocxText(absPath);
      const analysis = analyzeTextContent(docText, `${meta.filename} (${prettySize}) was shared.`);
      context = {
        summary: analysis.summary,
        highlights: analysis.highlights,
        suggestions: analysis.suggestions,
        tagline: SMART_CONTEXT_TAGLINE,
        meta,
      };
    } catch {
      context = {
        summary: `${meta.filename} (${prettySize}) was shared. Unable to extract text from this document.`,
        highlights: [],
        suggestions: ["Request the sender's key points or action items from the document."],
        tagline: SMART_CONTEXT_TAGLINE,
        meta,
      };
    }
  } else if (isPdf) {
    try {
      const pdfText = await extractPdfText(absPath);
      const analysis = analyzeTextContent(pdfText, `${meta.filename} (${prettySize}) was shared.`);
      context = {
        summary: analysis.summary,
        highlights: analysis.highlights,
        suggestions: analysis.suggestions,
        tagline: SMART_CONTEXT_TAGLINE,
        meta,
      };
    } catch {
      context = {
        summary: `${meta.filename} (${prettySize}) was shared. Unable to extract text from this PDF.`,
        highlights: [],
        suggestions: ["Request a brief summary of the PDF contents from the sender."],
        tagline: SMART_CONTEXT_TAGLINE,
        meta,
      };
    }
  } else if (isTextualFile(mimetype, meta.filename)) {
    try {
      const sample = await readFileSample(absPath);
      const analysis = analyzeTextContent(sample, `${meta.filename} (${prettySize}) was shared.`);
      context = {
        summary: analysis.summary,
        highlights: analysis.highlights,
        suggestions: analysis.suggestions,
        tagline: SMART_CONTEXT_TAGLINE,
        meta,
      };
    } catch {
      context = {
        summary: `${meta.filename} (${prettySize}) was shared. Review the attachment for full details.`,
        highlights: [],
        suggestions: ["Review the attachment and acknowledge any required actions."],
        tagline: SMART_CONTEXT_TAGLINE,
        meta,
      };
    }
  } else if (isImage) {
    context = {
      summary: `${meta.filename} (${prettySize}) image was shared. Review the visual content for relevant details.`,
      highlights: ["Check for diagrams, screenshots, or photos that support the discussion."],
      suggestions: ["Ask the sender to clarify key takeaways from the image if they aren't obvious."],
      tagline: SMART_CONTEXT_TAGLINE,
      meta,
    };
  } else {
    context = {
      summary: `${meta.filename} (${prettySize}) was shared. Preview is unavailable for this file type.`,
      highlights: [],
      suggestions: ["Request key details or next steps related to this attachment."],
      tagline: SMART_CONTEXT_TAGLINE,
      meta,
    };
  }
  if (attachmentContextCache.size >= ATTACHMENT_CONTEXT_CACHE_MAX) {
    const firstKey = attachmentContextCache.keys().next().value as string | undefined;
    if (firstKey) attachmentContextCache.delete(firstKey);
  }
  attachmentContextCache.set(cacheKey, context);
  return context;
}

async function ensureSmartContextForUpload(rawUrl: string, overrides?: { filename?: string; mimetype?: string; size?: number }): Promise<SmartContext | null> {
  const key = normalizeUploadKey(rawUrl);
  if (!key) return null;
  if (attachmentContextCache.has(key)) return attachmentContextCache.get(key)!;
  const abs = absoluteUploadPathFromKey(key);
  if (!abs) return null;
  const stats = await fs.promises.stat(abs).catch(() => null);
  if (!stats || !stats.isFile()) return null;
  const filename = overrides?.filename || path.basename(abs);
  const mimetype = overrides?.mimetype || guessMimeFromName(filename);
  const size = typeof overrides?.size === "number" ? overrides.size : stats.size;
  return generateSmartContext(key, abs, { filename, mimetype, size });
}

function parseStoredArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string" && entry.trim()).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function parseStoredMeta(value: string | null | undefined): { filename: string; size: number; mimetype: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const filename = typeof parsed.filename === "string" ? parsed.filename : "attachment";
    const size = typeof parsed.size === "number" ? parsed.size : 0;
    const mimetype = typeof parsed.mimetype === "string" ? parsed.mimetype : "application/octet-stream";
    return { filename, size, mimetype };
  } catch {
    return null;
  }
}

function extractFirstUploadUrl(text: string | null | undefined): string | null {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/\/?uploads\/[^\s)]+/i);
  if (match && match[0]) {
    const candidate = match[0].startsWith("/") ? match[0] : `/${match[0]}`;
    return candidate;
  }
  const httpMatch = text.match(/https?:\/\/[^\s)]+\/uploads\/[^\s)]+/i);
  if (httpMatch && httpMatch[0]) {
    return httpMatch[0];
  }
  return null;
}

function hydrateContextFromRow(row: { contextSummary?: string | null; contextHighlights?: string | null; contextSuggestions?: string | null; contextTagline?: string | null; contextMeta?: string | null }): SmartContext | null {
  const summary = row.contextSummary || null;
  const highlights = parseStoredArray(row.contextHighlights);
  const suggestions = parseStoredArray(row.contextSuggestions);
  const tagline = row.contextTagline || SMART_CONTEXT_TAGLINE;
  const meta = parseStoredMeta(row.contextMeta) || { filename: "attachment", size: 0, mimetype: "application/octet-stream" };
  if (!summary && highlights.length === 0 && suggestions.length === 0) {
    return null;
  }
  return {
    summary: summary || `${meta.filename} was shared.`,
    highlights,
    suggestions,
    tagline,
    meta,
  };
}

function serializeContextForStorage(context: SmartContext | null) {
  return {
    contextSummary: context?.summary ?? null,
    contextHighlights: context ? JSON.stringify(context.highlights ?? []) : null,
    contextSuggestions: context ? JSON.stringify(context.suggestions ?? []) : null,
    contextTagline: context?.tagline ?? null,
    contextMeta: context ? JSON.stringify(context.meta) : null,
  };
}

function normalizeContextMetaInput(input: any): { filename?: string; mimetype?: string; size?: number } | undefined {
  if (!input || typeof input !== "object") return undefined;
  const filename = typeof input.filename === "string" && input.filename.trim() ? input.filename.trim() : undefined;
  const mimetype = typeof input.mimetype === "string" && input.mimetype.trim() ? input.mimetype.trim() : undefined;
  const size = typeof input.size === "number" && Number.isFinite(input.size) && input.size >= 0 ? input.size : undefined;
  if (typeof filename === "undefined" && typeof mimetype === "undefined" && typeof size === "undefined") {
    return undefined;
  }
  return { filename, mimetype, size };
}

async function buildContextForMessage(text: string | null | undefined, overrides?: { filename?: string; mimetype?: string; size?: number }): Promise<SmartContext | null> {
  if (!text) return null;
  const uploadUrl = extractFirstUploadUrl(text);
  if (!uploadUrl) return null;
  return ensureSmartContextForUpload(uploadUrl, overrides);
}

function mapMessageRecord(m: any): any {
  if (!m) return null;
  const context = hydrateContextFromRow(m);
  const createdAt = m.createdAt?.getTime?.() ?? (m as any).createdAt ?? null;
  const senderAvatar = (m as any).senderAvatarUrl || m.sender?.avatarUrl || null;
  const senderName = m.senderName || m.sender?.name || m.sender?.email || null;
  const senderRoles = Array.isArray(m.sender?.roles)
    ? (m.sender as any).roles.map((r: any) => r.role)
    : [];
  const senderIsTeacher = senderRoles.includes("TEACHER") || senderRoles.includes("ADMIN");
  return {
    id: m.id,
    channelId: m.channelId,
    senderId: typeof m.senderId === "string" ? m.senderId : "",
    senderName,
    senderAvatarUrl: senderAvatar,
    text: m.text,
    createdAt,
    priority: (m as any).priority || "normal",
    senderIsTeacher,
    context,
  };
}

function mapPinRecord(pin: any): any {
  if (!pin) return null;
  const message = mapMessageRecord(pin.message || pin);
  if (!message) return null;
  const pinnedAt = pin.pinnedAt instanceof Date ? pin.pinnedAt.getTime() : pin.pinnedAt ?? Date.now();
  return {
    id: pin.id,
    message,
    pinnedById: pin.pinnedById || null,
    pinnedByName: pin.pinnedByName || null,
    pinnedAt,
  };
}

async function loadPins(channelId: string): Promise<any[]> {
  if (!channelId) return [];
  const rows = await prisma.channelPin.findMany({
    where: { channelId },
    orderBy: { pinnedAt: "desc" },
    include: {
      message: {
        include: { sender: { select: { avatarUrl: true, name: true, email: true, roles: { select: { role: true } } } } },
      },
    },
  });
  return rows.map((pin: any) => mapPinRecord(pin)).filter(Boolean);
}

// Activity logging helper
async function logActivity(entry: {
  kind: string;
  actorId?: string | null;
  actorName?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  message: string;
  data?: any;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        kind: entry.kind,
        actorId: entry.actorId || null,
        actorName: entry.actorName || null,
        subjectType: entry.subjectType || null,
        subjectId: entry.subjectId || null,
        message: entry.message,
        data: typeof entry.data === "string" ? entry.data : entry.data ? JSON.stringify(entry.data) : null,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[activity] failed to log", e);
  }
}

// =================== DMs: list my conversations (normalized) ===================
// Zego token minting (server-side only)
app.post("/api/zego/token", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId_required" });
    const appIdStr = process.env.ZEGO_APP_ID;
    const serverSecret = process.env.ZEGO_SERVER_SECRET;
    if (!appIdStr || !serverSecret) {
      return res.status(500).json({ error: "zego_env_missing" });
    }
    const appId = parseInt(appIdStr, 10);
    // Dynamic import to avoid crashing if not installed yet
    let assistant: any;
    try {
      assistant = require("zego-server-assistant");
    } catch {
      try { assistant = require("@zegocloud/server-assistant"); } catch {}
    }
    if (!assistant?.ZegoTokenServerAssistant) {
      return res.status(500).json({ error: "zego_server_assistant_not_installed" });
    }
    // 7200s (2h) expiration by default
    const effectiveTimeInSeconds = 7200;
    const payload = "{}";
    const token = assistant.ZegoTokenServerAssistant.generateToken04(appId, userId, serverSecret, effectiveTimeInSeconds, payload);
    return res.json({ token });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[zego] token error", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Authenticated: list all teachers for DM picker (available to any logged-in user)
app.get("/users/teachers", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    jwt.verify(token, JWT_SECRET);
    // Only include users explicitly having TEACHER role
    const roleRows = await prisma.userRole.findMany({ where: { role: "TEACHER" }, select: { userId: true } });
    const roleIds = roleRows.map((r: { userId: string }) => r.userId);
    let users: Array<{ id: string; name: string | null; email: string; roles: Array<{ role: string }> }> = roleIds.length
      ? await prisma.user.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true, email: true, roles: { select: { role: true } } }, orderBy: { name: "asc" } })
      : [];
    if (users.length === 0) {
      // Fallback inference: users with teacher-like profile fields
      const inferred = await prisma.user.findMany({
        where: {
          OR: [
            { profession: { not: null } },
            { schedule: { not: null } },
          ],
        },
        select: { id: true, name: true, email: true, roles: { select: { role: true } } },
        orderBy: { name: "asc" },
      });
      users = inferred;
    }
    // Exclude any ADMIN users and the seed teacher account from appearing in this list
    const filtered = users.filter((u) => {
      const hasAdmin = Array.isArray((u as any).roles) && (u as any).roles.some((r: { role: string }) => r.role === "ADMIN");
      const isSeedTeacher = typeof (u as any).email === "string" && (u as any).email.toLowerCase() === "teacher@seait.edu";
      return !hasAdmin && !isSeedTeacher;
    });
    const people = filtered.map((u: { id: string; name: string | null; email: string }) => ({
      id: u.id,
      name: u.name || u.email,
      handle: u.email,
      isTeacher: true,
    }));
    return res.json({ people });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

app.post("/channels/:id/pin", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });
  let decoded: { uid: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
  const channelId = String(req.params.id || "").trim();
  if (!channelId) return res.status(400).json({ error: "channel_required" });
  const messageId = String((req.body?.messageId ?? "").toString()).trim();
  if (!messageId) return res.status(400).json({ error: "message_required" });
  const user = await prisma.user.findUnique({ where: { id: decoded.uid } });
  if (!user) return res.status(404).json({ error: "user_not_found" });
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return res.status(404).json({ error: "channel_not_found" });
  const message = await prisma.message.findFirst({ where: { id: messageId, channelId } });
  if (!message) return res.status(404).json({ error: "message_not_found" });
  const pinnedByName = user.name || user.nickname || user.email || "Unknown";
  try {
    await prisma.channelPin.upsert({
      where: { channelId_messageId: { channelId, messageId } },
      create: {
        channelId,
        messageId,
        pinnedById: user.id,
        pinnedByName,
      },
      update: {
        pinnedById: user.id,
        pinnedByName,
        pinnedAt: new Date(),
      },
    });
    await emitPinnedUpdate(channelId);
    const pins = await loadPins(channelId);
    return res.json({ pins });
  } catch {
    return res.status(500).json({ error: "pin_failed" });
  }
});

app.delete("/channels/:id/pin", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });
  let decoded: { uid: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
  const channelId = String(req.params.id || "").trim();
  if (!channelId) return res.status(400).json({ error: "channel_required" });
  const messageId = typeof req.query?.messageId === "string" ? req.query.messageId.trim() : null;
  try {
    if (messageId) {
      await prisma.channelPin.delete({ where: { channelId_messageId: { channelId, messageId } } }).catch(() => null);
    } else {
      await prisma.channelPin.deleteMany({ where: { channelId } });
    }
    await emitPinnedUpdate(channelId);
    const pins = await loadPins(channelId);
    return res.json({ pins });
  } catch {
    return res.status(500).json({ error: "unpin_failed" });
  }
});

// =================== Section Groups (custom group chat inside a section) ===================
app.post("/section-groups", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    let decoded: { uid: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("/section-groups token_invalid", {
        hasAuthHeader: Boolean(req.headers.authorization),
        tokenLen: typeof token === "string" ? token.length : 0,
      });
      return res.status(401).json({ error: "token_invalid" });
    }
    const creatorId = decoded.uid;

    const creator = await prisma.user.findUnique({ where: { id: creatorId } });
    if (!creator) return res.status(404).json({ error: "not_found" });
    const yearLevel = String(creator.yearLevel || "").trim();
    const block = String(creator.block || "").trim().toUpperCase();
    if (!yearLevel || !block) return res.status(400).json({ error: "section_required" });
    const sectionId = `SEC-${yearLevel}-${block}`;

    const { name, memberIds } = req.body || {};
    const groupName = String(name || "").trim() || "Group";
    const rawMembers: string[] = Array.isArray(memberIds) ? memberIds.map((v: any) => String(v || "").trim()).filter(Boolean) : [];
    const uniq = new Set<string>([creatorId, ...rawMembers]);
    const ids = Array.from(uniq);
    // Require at least 3 total members: creator + at least 2 others
    if (ids.length < 3) return res.status(400).json({ error: "members_required" });
    if (ids.length > 50) return res.status(400).json({ error: "too_many_members" });

    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, yearLevel: true, block: true, roles: { select: { role: true } } } });
    const byId: Record<string, any> = {};
    for (const u of users) byId[u.id] = u;
    if (!byId[creatorId]) return res.status(404).json({ error: "not_found" });

    const allowedIds: string[] = [];
    for (const id of ids) {
      const u = byId[id];
      if (!u) continue;
      const roles = Array.isArray(u.roles) ? u.roles.map((r: any) => r.role) : [];
      const isAdmin = roles.includes("ADMIN");
      // Do not allow adding admin accounts into section-created groups
      if (isAdmin) continue;
      allowedIds.push(id);
    }
    if (!allowedIds.includes(creatorId)) allowedIds.push(creatorId);
    // After filtering out admin/nonexistent accounts, still require 3 total.
    if (allowedIds.length < 3) return res.status(400).json({ error: "members_required" });

    const channel = await prisma.channel.create({
      data: {
        name: groupName,
        topic: `sectionGroup:${sectionId};createdBy:${creatorId}`,
        kind: "section-group",
      },
    });

    // Older Prisma versions may not support createMany.skipDuplicates.
    // Insert memberships one-by-one and ignore failures (e.g. duplicates).
    await Promise.allSettled(
      allowedIds.map((uid) =>
        prisma.enrollment
          .create({ data: { userId: uid, channelId: channel.id } })
          .catch(() => null),
      ),
    );

    return res.status(201).json({ channel });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/section-groups error", e);
    const msg = (e as any)?.message ? String((e as any).message) : "";
    // Return message for debugging (no stack)
    return res.status(500).json({ error: "group_create_failed", message: msg });
  }
});

function parseCreatedByFromTopic(topic?: string | null): string | null {
  if (!topic) return null;
  const parts = String(topic).split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith("createdBy:")) {
      const v = p.slice("createdBy:".length).trim();
      return v || null;
    }
  }
  return null;
}

function addCreatedByToTopic(topic: string | null | undefined, userId: string): string {
  const current = (topic || "").trim();
  const existing = parseCreatedByFromTopic(current);
  if (existing) return current;
  const suffix = `createdBy:${userId}`;
  if (!current) return suffix;
  return `${current};${suffix}`;
}

async function requireMember(userId: string, channelId: string): Promise<boolean> {
  const m = await prisma.enrollment.findFirst({ where: { userId, channelId } });
  return Boolean(m);
}

// List members of a section-group channel
app.get("/section-groups/:id/members", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    const me = decoded.uid;
    const channelId = String(req.params.id || "").trim();
    if (!channelId) return res.status(400).json({ error: "channel_required" });

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.kind !== "section-group") return res.status(404).json({ error: "not_found" });

    const isMember = await requireMember(me, channelId);
    if (!isMember) return res.status(403).json({ error: "forbidden" });

    const enrolls = await prisma.enrollment.findMany({ where: { channelId }, select: { userId: true } });
    const ids = enrolls.map((e: any) => e.userId).filter(Boolean);
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, avatarUrl: true, roles: { select: { role: true } } } })
      : [];
    const members = users
      .map((u: any) => {
        const roles = Array.isArray(u.roles) ? u.roles.map((r: any) => r.role) : [];
        return { id: u.id, name: u.name || u.email, email: u.email, avatarUrl: u.avatarUrl || null, isTeacher: roles.includes("TEACHER") || roles.includes("ADMIN") };
      })
      .sort((a: any, b: any) => (a.name || a.email).localeCompare(b.name || b.email));
    return res.json({ members });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

// Rename a section-group channel (creator only)
app.patch("/section-groups/:id", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    const me = decoded.uid;
    const channelId = String(req.params.id || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!channelId) return res.status(400).json({ error: "channel_required" });
    if (!name) return res.status(400).json({ error: "name_required" });

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.kind !== "section-group") return res.status(404).json({ error: "not_found" });
    const isMember = await requireMember(me, channelId);
    if (!isMember) return res.status(403).json({ error: "forbidden" });
    const createdBy = parseCreatedByFromTopic(channel.topic);
    if (!createdBy || createdBy !== me) return res.status(403).json({ error: "forbidden" });

    const updated = await prisma.channel.update({ where: { id: channelId }, data: { name } });
    return res.json({ channel: updated });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

// Claim ownership for legacy section-group channels (no createdBy metadata)
app.post("/section-groups/:id/claim", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    const me = decoded.uid;
    const channelId = String(req.params.id || "").trim();
    if (!channelId) return res.status(400).json({ error: "channel_required" });

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.kind !== "section-group") return res.status(404).json({ error: "not_found" });
    const isMember = await requireMember(me, channelId);
    if (!isMember) return res.status(403).json({ error: "forbidden" });

    const existing = parseCreatedByFromTopic(channel.topic);
    if (existing) return res.status(409).json({ error: "already_claimed" });

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: { topic: addCreatedByToTopic(channel.topic, me) },
    });
    return res.json({ channel: updated });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

// Delete a section-group channel (creator only)
app.delete("/section-groups/:id", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    const me = decoded.uid;
    const channelId = String(req.params.id || "").trim();
    if (!channelId) return res.status(400).json({ error: "channel_required" });

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.kind !== "section-group") return res.status(404).json({ error: "not_found" });
    const isMember = await requireMember(me, channelId);
    if (!isMember) return res.status(403).json({ error: "forbidden" });
    const createdBy = parseCreatedByFromTopic(channel.topic);
    if (!createdBy || createdBy !== me) return res.status(403).json({ error: "forbidden" });

    await prisma.channelPin.deleteMany({ where: { channelId } }).catch(() => null);
    await prisma.message.deleteMany({ where: { channelId } }).catch(() => null);
    await prisma.enrollment.deleteMany({ where: { channelId } }).catch(() => null);
    await prisma.channel.delete({ where: { id: channelId } }).catch(() => null);
    return res.json({ ok: true });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

app.get("/dms", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    const me = decoded.uid;

    // Pull recent DM messages and infer conversations
    const msgs = await prisma.message.findMany({
      where: { channelId: { startsWith: "dm-" } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { channelId: true, createdAt: true, senderId: true },
    });

    type ChanStat = { lastAt: number; hasMeSender: boolean; lastOtherId: string | null };
    const chanStats: Record<string, ChanStat> = {};
    for (const m of msgs) {
      const key = m.channelId;
      const prev = chanStats[key] || { lastAt: 0, hasMeSender: false, lastOtherId: null };
      chanStats[key] = {
        lastAt: Math.max(prev.lastAt, (m as any).createdAt?.getTime?.() ?? (m as any).createdAt ?? Date.now()),
        hasMeSender: prev.hasMeSender || m.senderId === me,
        lastOtherId: m.senderId && m.senderId !== me ? m.senderId : prev.lastOtherId,
      };
    }

    // Build normalized entries: symmetric id dm-<low>-<high>
    const dmMap: Record<string, { channelId: string; otherId: string; lastAt: number }> = {};
    for (const [cid, stat] of Object.entries(chanStats)) {
      if (!cid.startsWith("dm-")) continue;
      const parts = cid.split("-");
      if (parts.length === 3) {
        // symmetric
        const a = parts[1], b = parts[2];
        if (a !== me && b !== me) continue; // not mine
        const other = a === me ? b : b === me ? a : "";
        if (!other) continue;
        const [lo, hi] = me < other ? [me, other] : [other, me];
        const symId = `dm-${lo}-${hi}`;
        const at = stat.lastAt;
        if (!dmMap[symId] || at > dmMap[symId].lastAt) dmMap[symId] = { channelId: symId, otherId: other, lastAt: at };
      } else if (parts.length === 2) {
        // legacy
        const only = parts[1];
        if (only === me) {
          // legacy channel addressed to me (dm-<me>): infer other from lastOtherId (sender not me)
          const other = stat.lastOtherId;
          if (!other) continue;
          const [lo, hi] = me < other ? [me, other] : [other, me];
          const symId = `dm-${lo}-${hi}`;
          const at = stat.lastAt;
          if (!dmMap[symId] || at > dmMap[symId].lastAt) dmMap[symId] = { channelId: symId, otherId: other, lastAt: at };
        } else {
          // legacy channel addressed to other (dm-<other>): include regardless of whether I've sent yet
          const other = only;
          const [lo, hi] = me < other ? [me, other] : [other, me];
          const symId = `dm-${lo}-${hi}`;
          const at = stat.lastAt;
          if (!dmMap[symId] || at > dmMap[symId].lastAt) dmMap[symId] = { channelId: symId, otherId: other, lastAt: at };
        }
      }
    }

    const entries = Object.values(dmMap).sort((a, b) => b.lastAt - a.lastAt).slice(0, 200);
    if (entries.length === 0) return res.json({ dms: [] });
    const others = await prisma.user.findMany({
      where: { id: { in: entries.map((e) => e.otherId) } },
      select: { id: true, name: true, email: true, avatarUrl: true, roles: { select: { role: true } } },
    });
    const infoMap: Record<string, { id: string; name: string | null; email: string; avatarUrl: string | null; isTeacher: boolean }> = {};
    for (const u of others) {
      const roles = Array.isArray((u as any).roles) ? (u as any).roles.map((r: any) => r.role) : [];
      const isTeacher = roles.includes("TEACHER") || roles.includes("ADMIN");
      infoMap[u.id] = { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl || null, isTeacher };
    }
    return res.json({
      dms: entries.map((e) => ({
        channelId: e.channelId,
        other: infoMap[e.otherId] || { id: e.otherId, name: null, email: e.otherId, avatarUrl: null, isTeacher: false },
        lastAt: e.lastAt,
      })),
    });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

// Ensure initial admin exists
async function ensureInitialAdmin() {
  const email = "Admin@gmail.com";
  const password = "Admin123";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: "Administrator",
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: "ADMIN" } });
    // eslint-disable-next-line no-console
    console.log(`[seed] Created initial admin ${email}`);
  } else {
    // Ensure ADMIN role present
    const hasAdmin = await prisma.userRole.findFirst({ where: { userId: existing.id, role: "ADMIN" } });
    if (!hasAdmin) {
      await prisma.userRole.create({ data: { userId: existing.id, role: "ADMIN" } });
      // eslint-disable-next-line no-console
      console.log(`[seed] Granted ADMIN role to ${email}`);
    }
  }
}

async function ensureInitialTeacher() {
  const email = "teacher@seait.edu";
  const password = "Teacher123";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: "Teacher",
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: "TEACHER" } });
    // eslint-disable-next-line no-console
    console.log(`[seed] Created initial teacher ${email}`);
  } else {
    const hasTeacher = await prisma.userRole.findFirst({ where: { userId: existing.id, role: "TEACHER" } });
    if (!hasTeacher) {
      await prisma.userRole.create({ data: { userId: existing.id, role: "TEACHER" } });
      // eslint-disable-next-line no-console
      console.log(`[seed] Granted TEACHER role to ${email}`);
    }
  }
}

// Simple admin guard using the same JWT secret as auth.ts
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";
function getBearerToken(req: express.Request): string | null {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
}
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");
    if (type !== "Bearer" || !token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string; roles?: string[] };
    // Prefer roles from token, but verify from DB when missing
    if (decoded?.roles && decoded.roles.includes("ADMIN")) {
      (req as any).adminUserId = decoded.uid;
      return next();
    }
    const roles: Array<{ role: string }> = await prisma.userRole.findMany({ where: { userId: decoded.uid } });
    const hasAdmin = roles.some((r: { role: string }) => r.role === "ADMIN");
    if (!hasAdmin) return res.status(403).json({ error: "forbidden" });
    (req as any).adminUserId = decoded.uid;
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

async function requireTeacher(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");
    if (type !== "Bearer" || !token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string; roles?: string[] };
    if (decoded?.roles && (decoded.roles.includes("TEACHER") || decoded.roles.includes("ADMIN"))) {
      (req as any).teacherUserId = decoded.uid;
      (req as any).teacherRoles = decoded.roles || [];
      return next();
    }
    const roles: Array<{ role: string }> = await prisma.userRole.findMany({ where: { userId: decoded.uid } });
    const hasTeacher = roles.some((roleEntry) => roleEntry.role === "TEACHER" || roleEntry.role === "ADMIN");
    if (!hasTeacher) return res.status(403).json({ error: "forbidden" });
    (req as any).teacherUserId = decoded.uid;
    (req as any).teacherRoles = roles.map((roleEntry) => roleEntry.role);
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

// Authenticated: list all students for DM picker (available to any logged-in user)
app.get("/users/students", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    jwt.verify(token, JWT_SECRET);
    const roleRows = await prisma.userRole.findMany({ where: { role: "STUDENT" }, select: { userId: true } });
    const roleIds = roleRows.map((r: { userId: string }) => r.userId);
    let users: Array<{ id: string; name: string | null; email: string; roles: Array<{ role: string }> }>
      = roleIds.length
      ? await prisma.user.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true, email: true, roles: { select: { role: true } } }, orderBy: { name: "asc" } })
      : [];
    if (users.length === 0) {
      // Fallback: infer students by academic fields or enrollments
      const inferred = await prisma.user.findMany({
        where: {
          OR: [
            { studentId: { not: null } },
            { yearLevel: { not: null } },
            { block: { not: null } },
            { enrollments: { some: { OR: [ { subjectId: { not: null } }, { channelId: { not: null } } ] } } },
          ],
        },
        select: { id: true, name: true, email: true, roles: { select: { role: true } } },
      });
      const uniq: Record<string, { id: string; name: string | null; email: string; roles: Array<{ role: string }> }> = {};
      for (const u of inferred) uniq[u.id] = { ...u, roles: Array.isArray((u as any).roles) ? (u as any).roles : [] } as any;
      users = Object.values(uniq).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    }
    const people = users.map((u) => ({
      id: u.id,
      name: u.name || u.email,
      handle: u.email,
      isTeacher: u.roles?.some?.((r) => r.role === "TEACHER" || r.role === "ADMIN") || false,
    }));
    return res.json({ people });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

async function getTeacherAcademicOverview(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const { id: sectionId, name: sectionName } = buildSectionId(user.yearLevel, user.block);

  const subjectMemberships = await prisma.enrollment.findMany({
    where: {
      userId,
      OR: [
        { subjectId: { not: null } },
        { channelId: { startsWith: "SEC-", contains: "::" } },
      ],
    },
    include: { subject: true, channel: true },
    orderBy: { subjectId: "asc" },
  });

  const subjects: Array<{ id: string; name: string; channelId: string }> = [];
  for (const membership of subjectMemberships) {
    const fromColumn = String(membership.subjectId || "").trim();
    const channelId = String(membership.channelId || "").trim();
    let subjectId = fromColumn;
    if (!subjectId && channelId.startsWith("SEC-") && channelId.includes("::")) {
      subjectId = String(channelId.split("::")[1] || "").trim();
    }
    if (!subjectId) continue;
    subjects.push({
      id: subjectId,
      name: membership.subject?.name || subjectId,
      channelId: channelId || subjectId,
    });
  }

  const availableSubjects = await prisma.subject.findMany({ orderBy: { id: "asc" } });
  const sectionMemberCount = sectionId
    ? await prisma.enrollment.count({ where: { channelId: sectionId } })
    : 0;

  return {
    section: sectionId
      ? {
          id: sectionId,
          name: sectionName,
          yearLevel: user.yearLevel,
          block: user.block,
          channelId: sectionId,
          members: sectionMemberCount,
        }
      : null,
    subjects,
    availableSubjects: availableSubjects.map((subject: (typeof availableSubjects)[number]) => ({
      id: subject.id,
      name: subject.name || subject.id,
    })),
  };
}

// =================== Teacher: Sections & Subjects ===================
app.get("/teacher/sections", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const overview = await getTeacherAcademicOverview(userId);
  if (!overview) return res.status(404).json({ error: "not_found" });
  res.json(overview);
});

app.post("/teacher/sections", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const { yearLevel, block, subjects, assignments } = req.body || {};
  const yl = String(yearLevel || "").trim();
  if (!yl) return res.status(400).json({ error: "yearLevel_required" });

  // Self-setup supports multiple blocks under a single year.
  // Payload:
  //  { yearLevel: "1", assignments: [{ block: "B1", subjectCodes:["IT-222"] }, ...] }
  const multi = Array.isArray(assignments) ? assignments : null;
  if (multi && multi.length > 0) {
    // Set teacher display year
    await prisma.user.update({ where: { id: userId }, data: { yearLevel: yl } });

    for (const entry of multi) {
      const bl = String(entry?.block || "").trim().toUpperCase();
      const subs = Array.isArray(entry?.subjectCodes)
        ? entry.subjectCodes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean)
        : [];
      if (!bl || subs.length === 0) continue;
      await assignAcademicMemberships({
        userId,
        yearLevel: yl,
        block: bl,
        subjectCodes: subs,
        replaceSubjects: false,
      });
    }
  } else {
    // Backward-compatible single section + subjects payload.
    const bl = String(block || "").trim().toUpperCase();
    if (!bl) {
      return res.status(400).json({ error: "block_required" });
    }
    await prisma.user.update({ where: { id: userId }, data: { yearLevel: yl, block: bl } });
    await assignAcademicMemberships({
      userId,
      yearLevel: yl,
      block: bl,
      subjectCodes: Array.isArray(subjects) ? subjects : [],
      replaceSubjects: Array.isArray(subjects),
    });
    if (Array.isArray(subjects)) {
      await assignSectionMembershipsToStudents({
        yearLevel: yl,
        block: bl,
        subjectCodes: subjects,
      });
    }
  }
  const overview = await getTeacherAcademicOverview(userId);
  res.json(overview);
});

app.post("/teacher/subjects", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const { subjects } = req.body || {};
  await assignAcademicMemberships({
    userId,
    subjectCodes: Array.isArray(subjects) ? subjects : [],
    replaceSubjects: true,
  });
  const overview = await getTeacherAcademicOverview(userId);
  res.json(overview);
});

// Teacher-managed subject catalog (so students can pick subjects without typing codes)
app.post("/teacher/subject-catalog", requireTeacher, async (req, res) => {
  const { subjects } = req.body || {};
  const list = Array.isArray(subjects) ? subjects : [];
  const created: string[] = [];
  for (const entry of list) {
    const id = String(entry?.id || "").trim().toUpperCase();
    if (!id) continue;
    const name = typeof entry?.name === "string" ? entry.name.trim() : null;
    await prisma.subject.upsert({
      where: { id },
      update: { name },
      create: { id, name },
    });
    created.push(id);
  }
  const subjectsAll = await prisma.subject.findMany({ orderBy: { id: "asc" } });
  return res.json({ ok: true, created, subjects: subjectsAll.map((s: any) => ({ id: s.id, name: s.name || null })) });
});

app.get("/teacher/subject-catalog", requireTeacher, async (_req, res) => {
  const subjectsAll = await prisma.subject.findMany({ orderBy: { id: "asc" } });
  return res.json({ subjects: subjectsAll.map((s: any) => ({ id: s.id, name: s.name || null })) });
});

// =================== Teacher: Profile (view/edit own)
app.get("/teacher/me", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      schedule: user.schedule,
      avatarUrl: user.avatarUrl,
      yearLevel: user.yearLevel,
      block: user.block,
      profession: user.profession,
    },
  });
});

app.patch("/teacher/me", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const { name, nickname, schedule, avatarUrl } = req.body || {};
  const data: any = {};
  if (typeof name !== "undefined") data.name = name || null;
  if (typeof nickname !== "undefined") data.nickname = nickname || null;
  if (typeof schedule !== "undefined") data.schedule = schedule || null;
  if (typeof avatarUrl !== "undefined") data.avatarUrl = avatarUrl || null;
  const updated = await prisma.user.update({ where: { id: userId }, data });
  await logActivity({
    kind: "profile.update",
    actorId: userId,
    actorName: updated.name || null,
    subjectType: "user",
    subjectId: userId,
    message: "Teacher updated profile",
    data: { name, nickname, schedule, avatarUrl },
  });
  res.json({ ok: true });
});

// List students for teacher dashboard
app.get("/teacher/students", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher) return res.status(404).json({ error: "not_found" });
  const { scope = "section", code = "", period = "7d" } = req.query as Record<string, string>;
  const since = parsePeriod(period);

  let students: Array<{ id: string; name: string | null; email: string; studentId: string | null }> = [];
  let channelIdsForCounts: string[] | null = null;

  if (scope === "all") {
    // Explicit 'all' still returns all students (admin-like view)
    const list = await prisma.user.findMany({
      where: { roles: { some: { role: "STUDENT" } } },
      select: { id: true, name: true, email: true, studentId: true },
      orderBy: { name: "asc" },
    });
    students = list;
    channelIdsForCounts = null;
  } else if (scope === "subject") {
    const subjectCode = String(code || "").trim();
    if (!subjectCode) return res.status(400).json({ error: "subject_required" });
    const enrollments = await prisma.enrollment.findMany({ where: { subjectId: subjectCode }, select: { userId: true } });
    const studentIds = enrollments.map((e: { userId: string }) => e.userId);
    if (studentIds.length === 0) return res.json({ period, students: [] });
    students = await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, email: true, studentId: true } });
    // Count in any channel for this subject that belongs to one of teacher's sections if possible
    const mySectionEnrolls = await prisma.enrollment.findMany({ where: { userId, channelId: { startsWith: "SEC-" } }, select: { channelId: true } });
    const mySectionsSet = new Set<string>(
      mySectionEnrolls
        .map((e: { channelId: string | null }) => (e.channelId || "").split("::")[0])
        .filter((v: string) => Boolean(v)) as string[],
    );
    const mySections: string[] = Array.from(mySectionsSet);
    channelIdsForCounts = mySections.length > 0 ? mySections.map((sid: string) => `${sid}::${subjectCode}`) : [subjectCode];
  } else {
    // section (default) – restrict to ONLY students enrolled in the teacher's assigned section-subject channels.
    // This prevents showing all students in the same year/block when the teacher only handles specific subjects.
    const subjectChannelEnrolls = await prisma.enrollment.findMany({
      where: {
        userId,
        channelId: { startsWith: "SEC-", contains: "::" },
      },
      select: { channelId: true },
    });
    const subjectChannelIds = subjectChannelEnrolls
      .map((e: { channelId: string | null }) => (e.channelId || "").trim())
      .filter((cid: string) => Boolean(cid));
    if (subjectChannelIds.length === 0) return res.json({ period, scope, students: [] });

    const studentEnrolls = await prisma.enrollment.findMany({
      where: { channelId: { in: subjectChannelIds } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const studentIds = studentEnrolls.map((e: { userId: string }) => e.userId);
    if (studentIds.length === 0) return res.json({ period, scope, students: [] });

    students = await prisma.user.findMany({
      where: { id: { in: studentIds }, roles: { some: { role: "STUDENT" } } },
      select: { id: true, name: true, email: true, studentId: true },
      orderBy: { name: "asc" },
    });
    channelIdsForCounts = subjectChannelIds;
  }

  // Counts and last active
  let counts: Array<{ senderId: string | null; _count: { _all: number } }> = [];
  if (channelIdsForCounts && channelIdsForCounts.length > 0) {
    counts = await prisma.message.groupBy({ by: ["senderId"], where: { channelId: { in: channelIdsForCounts }, createdAt: { gte: since } }, _count: { _all: true } });
  } else if (!channelIdsForCounts) {
    const studentIds = students.map((s) => s.id);
    if (studentIds.length > 0) {
      counts = await prisma.message.groupBy({ by: ["senderId"], where: { createdAt: { gte: since }, senderId: { in: studentIds } }, _count: { _all: true } });
    }
  }
  const countMap = counts.reduce((acc: Record<string, number>, row: { senderId: string | null; _count?: { _all?: number } }) => {
    if (row.senderId) acc[row.senderId] = row._count?._all || 0;
    return acc;
  }, {} as Record<string, number>);

  const latest = await prisma.message.findMany({
    where: channelIdsForCounts && channelIdsForCounts.length > 0
      ? { channelId: { in: channelIdsForCounts } }
      : {},
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { senderId: true, createdAt: true },
  });
  const lastActive: Record<string, Date> = {};
  for (const m of latest) if (m.senderId) lastActive[m.senderId] ||= m.createdAt;

  return res.json({
    period,
    scope,
    students: students.map((s) => ({
      id: s.id,
      name: s.name || s.email,
      email: s.email,
      studentId: s.studentId,
      messages: countMap[s.id] || 0,
      lastActiveAt: lastActive[s.id] ? lastActive[s.id].toISOString() : null,
    })),
  });
});

// =================== Teacher: Student management (create/remove) ===================
app.post("/teacher/students", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const teacher = await prisma.user.findUnique({ where: { id: teacherUserId } });
  if (!teacher) return res.status(404).json({ error: "not_found" });
  const { email, password, name, nickname, studentId, schedule, avatarUrl, subjectCodes, yearLevel, block } = req.body || {};
  if (!email || !password || !studentId) return res.status(400).json({ error: "email_password_studentId_required" });
  // Target section is defined by the request, but must be within the teacher's assigned enrollments.
  const targetYear = String(yearLevel || "").trim();
  const targetBlock = String(block || "").trim().toUpperCase();
  if (!targetYear || !targetBlock) return res.status(400).json({ error: "year_block_required" });
  const { id: targetSectionId } = buildSectionId(targetYear, targetBlock);
  if (!targetSectionId) return res.status(400).json({ error: "invalid_section" });

  // Normalize requested subject codes (required)
  const codes: string[] = Array.isArray(subjectCodes)
    ? subjectCodes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean)
    : [];
  if (codes.length === 0) return res.status(400).json({ error: "subjectCodes_required" });

  // If student exists, only enroll to allowed subjects. Otherwise, create and enroll.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const isStudent = await prisma.userRole.findFirst({ where: { userId: existingUser.id, role: "STUDENT" }, select: { id: true } });
    if (!isStudent) return res.status(400).json({ error: "existing_user_not_student" });
    if (existingUser.yearLevel !== targetYear || (existingUser.block || "").toUpperCase() !== targetBlock) {
      return res.status(403).json({ error: "forbidden" });
    }
    await assignAcademicMemberships({
      userId: existingUser.id,
      subjectCodes: codes,
      yearLevel: targetYear,
      block: targetBlock,
      replaceSubjects: false,
    });
    await logActivity({
      kind: "student.enroll",
      actorId: teacherUserId,
      actorName: teacher?.name || null,
      subjectType: "student",
      subjectId: existingUser.id,
      message: `Teacher enrolled existing student ${email}`,
      data: { email, yearLevel: targetYear, block: targetBlock, subjectCodes: codes },
    });
    return res.json({ id: existingUser.id });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      nickname: nickname || null,
      studentId: studentId || null,
      yearLevel: targetYear,
      block: targetBlock,
      schedule: schedule || null,
      avatarUrl: avatarUrl || null,
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: "STUDENT" } });
  await assignAcademicMemberships({
    userId: user.id,
    subjectCodes: codes,
    yearLevel: targetYear,
    block: targetBlock,
    replaceSubjects: true,
  });
  await logActivity({
    kind: "student.create",
    actorId: teacherUserId,
    actorName: teacher?.name || null,
    subjectType: "student",
    subjectId: user.id,
    message: `Teacher created student ${email}`,
    data: { email, studentId, yearLevel: targetYear, block: targetBlock, subjectCodes: codes },
  });
  return res.status(201).json({ id: user.id });
});

app.delete("/teacher/students/:id", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const teacher = await prisma.user.findUnique({ where: { id: teacherUserId } });
  if (!teacher?.yearLevel || !teacher?.block) return res.status(400).json({ error: "teacher_section_required" });
  const id = req.params.id;
  const student = await prisma.user.findUnique({ where: { id } });
  if (!student) return res.status(404).json({ error: "not_found" });
  // Only allow removal within same section
  if (student.yearLevel !== teacher.yearLevel || (student.block || "").toUpperCase() !== (teacher.block || "").toUpperCase()) {
    return res.status(403).json({ error: "forbidden" });
  }
  await prisma.userRole.deleteMany({ where: { userId: id } });
  await prisma.enrollment.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });
  await logActivity({
    kind: "student.delete",
    actorId: teacherUserId,
    actorName: teacher?.name || null,
    subjectType: "student",
    subjectId: id,
    message: `Teacher removed student ${student.email}`,
  });
  return res.json({ ok: true });
});

// =================== Teacher: Engagement
function parsePeriod(period?: string) {
  const now = Date.now();
  if (period === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (period === "7d" || !period) return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (period === "24h") return new Date(now - 24 * 60 * 60 * 1000);
  return new Date(now - 7 * 24 * 60 * 60 * 1000);
}

// Parse optional date input from client payloads.
// - Returns a Date when value is a valid date string
// - Returns null when value is null/empty string
// - Returns undefined when value is provided but invalid (to trigger 400)
function parseDateInput(value: any): Date | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

app.get("/teacher/engagement/section", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const period = String((req.query as any).period || "7d");
  const since = parsePeriod(period);
  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher) return res.json({ period, students: [] });

  // Collect teacher's section ids from enrollments (supports multiple)
  const sectionEnrolls = await prisma.enrollment.findMany({ where: { userId, channelId: { startsWith: "SEC-" } }, select: { channelId: true } });
  const sectionIdsSet = new Set<string>(
    sectionEnrolls
      .map((e: { channelId: string | null }) => (e.channelId || "").split("::")[0])
      .filter((v: string) => Boolean(v)) as string[],
  );
  let sectionIds: string[] = Array.from(sectionIdsSet);
  if (sectionIds.length === 0) {
    const { id: fallback } = buildSectionId(teacher.yearLevel, teacher.block);
    if (fallback) sectionIds = [fallback];
  }
  if (sectionIds.length === 0) return res.json({ period, students: [] });

  // Build OR filters for students in any of the teacher's sections
  const pairs = sectionIds
    .map((sid: string) => {
      const parts = sid.split("-");
      return parts.length >= 3 ? { yearLevel: parts[1], block: parts[2] } : null;
    })
    .filter((p): p is { yearLevel: string; block: string } => Boolean(p));

  const students = await prisma.user.findMany({
    where: { roles: { some: { role: "STUDENT" } }, OR: pairs.map((p) => ({ yearLevel: p.yearLevel, block: p.block })) },
    select: { id: true, name: true, email: true, studentId: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  // Counts across any of the section channels
  const counts = await prisma.message.groupBy({
    by: ["senderId"],
    where: { channelId: { in: sectionIds }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const latest = await prisma.message.findMany({
    where: { channelId: { in: sectionIds } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { senderId: true, createdAt: true },
  });
  const lastActive: Record<string, Date> = {};
  for (const m of latest) if (m.senderId) lastActive[m.senderId] ||= m.createdAt;
  const countMap = counts.reduce((acc: Record<string, number>, row: { senderId: string | null; _count?: { _all?: number } }) => {
    if (row.senderId) acc[row.senderId] = row._count?._all || 0;
    return acc;
  }, {} as Record<string, number>);
  res.json({
    period,
    students: students.map((s: { id: string; name: string | null; email: string; studentId: string | null }) => ({
      id: s.id,
      name: s.name || s.email,
      email: s.email,
      studentId: s.studentId,
      messages: countMap[s.id] || 0,
      lastActiveAt: lastActive[s.id] ? lastActive[s.id].toISOString() : null,
    })),
  });
});

app.get("/teacher/engagement/subject", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const { code = "", period = "7d" } = req.query as Record<string, string>;
  const since = parsePeriod(period);
  const subjectCode = String(code || "").trim();
  if (!subjectCode) return res.status(400).json({ error: "subject_required" });

  // Determine teacher section ids
  const mySectionEnrolls = await prisma.enrollment.findMany({ where: { userId, channelId: { startsWith: "SEC-" } }, select: { channelId: true } });
  const mySectionsSet = new Set<string>(
    mySectionEnrolls
      .map((e: { channelId: string | null }) => (e.channelId || "").split("::")[0])
      .filter((v: string) => Boolean(v)) as string[],
  );
  const mySections: string[] = Array.from(mySectionsSet);

  // Students enrolled in this subject AND within teacher's sections (by year/block)
  const enrollments = await prisma.enrollment.findMany({ where: { subjectId: subjectCode }, select: { userId: true } });
  const studentIds = enrollments.map((e: { userId: string }) => e.userId);

  let students: Array<{ id: string; name: string | null; email: string; studentId: string | null }> = [];
  if (studentIds.length > 0) {
    if (mySections.length > 0) {
      const pairs = mySections
        .map((sid: string) => {
          const parts = sid.split("-");
          return parts.length >= 3 ? { yearLevel: parts[1], block: parts[2] } : null;
        })
        .filter((p): p is { yearLevel: string; block: string } => Boolean(p));
      students = await prisma.user.findMany({
        where: { id: { in: studentIds }, OR: pairs.map((p) => ({ yearLevel: p.yearLevel, block: p.block })) },
        select: { id: true, name: true, email: true, studentId: true },
      });
    } else {
      students = await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, email: true, studentId: true } });
    }
  }

  // Count messages in the section-subject channels for the teacher's sections, fallback to global subject channel when none
  const channelIds = mySections.length > 0 ? mySections.map((sid: string) => `${sid}::${subjectCode}`) : [subjectCode];
  const counts = await prisma.message.groupBy({
    by: ["senderId"],
    where: { channelId: { in: channelIds }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const latest = await prisma.message.findMany({
    where: { channelId: { in: channelIds } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { senderId: true, createdAt: true },
  });
  const lastActive: Record<string, Date> = {};
  for (const m of latest) if (m.senderId) lastActive[m.senderId] ||= m.createdAt;
  const countMap = counts.reduce((acc: Record<string, number>, row: { senderId: string | null; _count?: { _all?: number } }) => {
    if (row.senderId) acc[row.senderId] = row._count?._all || 0;
    return acc;
  }, {} as Record<string, number>);
  res.json({
    period,
    subject: subjectCode,
    students: students.map((s: { id: string; name: string | null; email: string; studentId: string | null }) => ({
      id: s.id,
      name: s.name || s.email,
      email: s.email,
      studentId: s.studentId,
      messages: countMap[s.id] || 0,
      lastActiveAt: lastActive[s.id] ? lastActive[s.id].toISOString() : null,
    })),
  });
});

// =================== Teacher: Students (view/edit limited) ===================
app.get("/teacher/students/:id", requireTeacher, async (req, res) => {
  const id = req.params.id;
  const student = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      studentId: true,
      yearLevel: true,
      block: true,
      schedule: true,
      avatarUrl: true,
      profession: true,
    },
  });
  if (!student) return res.status(404).json({ error: "not_found" });
  const roles = await prisma.userRole.findMany({ where: { userId: id }, select: { role: true } });
  const isStudent = roles.some((r: { role: string }) => r.role === "STUDENT");
  if (!isStudent) return res.status(400).json({ error: "not_student" });
  res.json({ user: student });
});

app.patch("/teacher/students/:id", requireTeacher, async (req, res) => {
  const id = req.params.id;
  const { name, nickname, schedule, avatarUrl } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "not_found" });
  const roles = await prisma.userRole.findMany({ where: { userId: id }, select: { role: true } });
  const isStudent = roles.some((r: { role: string }) => r.role === "STUDENT");
  if (!isStudent) return res.status(400).json({ error: "not_student" });
  const data: any = {};
  if (typeof name !== "undefined") data.name = name || null;
  if (typeof nickname !== "undefined") data.nickname = nickname || null;
  if (typeof schedule !== "undefined") data.schedule = schedule || null;
  if (typeof avatarUrl !== "undefined") data.avatarUrl = avatarUrl || null;
  const updated = await prisma.user.update({ where: { id }, data });
  const teacherUserId = (req as any).teacherUserId as string;
  const teacher = await prisma.user.findUnique({ where: { id: teacherUserId } });
  await logActivity({
    kind: "student.update",
    actorId: teacherUserId,
    actorName: teacher?.name || null,
    subjectType: "student",
    subjectId: id,
    message: `Teacher updated student ${updated.email}`,
    data: { name, nickname, schedule, avatarUrl },
  });
  res.json({ ok: true });
});

// =================== Teacher: Audience lookup ===================
app.get("/teacher/audience", requireTeacher, async (req, res) => {
  const userId = (req as any).teacherUserId as string;
  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher) return res.status(404).json({ error: "not_found" });

  // Subjects the teacher is enrolled in
  const subjects = await prisma.enrollment.findMany({
    where: { userId, subjectId: { not: null } },
    select: { subjectId: true },
    distinct: ["subjectId"],
    orderBy: { subjectId: "asc" },
  });

  // Collect teacher's section ids from enrollments (supports multiple)
  const sectionEnrolls = await prisma.enrollment.findMany({ where: { userId, channelId: { startsWith: "SEC-" } }, select: { channelId: true } });
  const sectionIdsSet = new Set<string>(
    sectionEnrolls
      .map((e: { channelId: string | null }) => (e.channelId || "").split("::")[0])
      .filter((v: string) => Boolean(v)) as string[],
  );
  let sectionIds: string[] = Array.from(sectionIdsSet);
  if (sectionIds.length === 0) {
    const { id: fallback } = buildSectionId(teacher.yearLevel, teacher.block);
    if (fallback) sectionIds = [fallback];
  }

  // Build students query across all sections
  let students: Array<{ id: string; name: string | null; email: string; studentId: string | null } > = [];
  if (sectionIds.length > 0) {
    const pairs = sectionIds
      .map((sid: string) => {
        const parts = sid.split("-");
        return parts.length >= 3 ? { yearLevel: parts[1], block: parts[2] } : null;
      })
      .filter((p): p is { yearLevel: string; block: string } => Boolean(p));
    students = await prisma.user.findMany({
      where: { roles: { some: { role: "STUDENT" } }, OR: pairs.map((p) => ({ yearLevel: p.yearLevel, block: p.block })) },
      select: { id: true, name: true, email: true, studentId: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
  }

  // Keep legacy single section for compatibility (first available)
  const primary = sectionIds[0] || null;
  const sectionName = primary ? primary.replace(/^SEC-/, "Section ") : null;

  res.json({
    section: primary ? { id: primary, name: sectionName } : null,
    subjects: subjects.map((s: { subjectId: string | null }) => s.subjectId).filter(Boolean),
    students,
  });
});

// List available subjects (for profile selection)
app.get("/subjects", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    const roles = await prisma.userRole.findMany({ where: { userId: decoded.uid } });
    const roleNames = roles.map((r: any) => r.role);
    if (roleNames.includes("ADMIN")) return res.status(403).json({ error: "forbidden" });

    const subjects = await prisma.subject.findMany({ orderBy: { id: "asc" } });
    return res.json({ subjects: subjects.map((s: any) => ({ id: s.id, name: s.name || null })) });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

// =================== Public: Section subject suggestions ===================
app.get("/public/section-subjects", async (req, res) => {
  try {
    const { yearLevel = "", block = "" } = req.query as Record<string, string>;
    const year = String(yearLevel || "").trim();
    const blk = String(block || "").trim().toUpperCase();
    if (!year || !blk) return res.json({ subjects: [] });
    const { id: sectionId } = buildSectionId(year, blk);
    if (!sectionId) return res.json({ subjects: [] });
    // Find channels like SEC-<year>-<block>::<CODE>
    const channels = await prisma.channel.findMany({
      where: { id: { startsWith: `${sectionId}::` }, kind: "section-subject" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const codes = new Set<string>();
    for (const ch of channels) {
      const parts = (ch.id || "").split("::");
      const code = parts.length >= 2 ? (parts[parts.length - 1] || "").trim() : "";
      if (code) codes.add(code);
    }
    return res.json({ subjects: Array.from(codes).sort() });
  } catch (e) {
    return res.json({ subjects: [] });
  }
});

// =================== Teacher: Activity logs ===================
app.get("/teacher/activity", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const { kind = "", subjectType = "", subjectId = "", cursor = null, limit = "50" } =
    req.query as Record<string, string>;

  const take = Math.min(Math.max(parseInt(String(limit) || "50", 10) || 50, 1), 200);

  const where: any = {
    actorId: teacherUserId,
  };
  if (kind) where.kind = kind;
  if (subjectType) where.subjectType = subjectType;
  if (subjectId) where.subjectId = subjectId;

  const query: any = {
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      kind: true,
      actorId: true,
      actorName: true,
      subjectType: true,
      subjectId: true,
      message: true,
      data: true,
      createdAt: true,
    },
  };

  if (cursor) {
    query.cursor = { id: String(cursor) };
    query.skip = 1;
  }

  const items = await prisma.activityLog.findMany(query);
  const nextCursor = items.length === take ? items[items.length - 1]?.id : null;
  res.json({ items, nextCursor });
});

// =================== Teacher: Activity logs (group & campus-wide appearances) ===================
app.get("/teacher/activity/groups", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const { subjectType = "", subjectId = "", cursor = null, limit = "50" } =
    req.query as Record<string, string>;

  const take = Math.min(Math.max(parseInt(String(limit) || "50", 10) || 50, 1), 200);

  // Allowed channel kinds to represent groups and campus-wide interactions
  const allowedKinds = ["general", "subject", "section", "section-subject", "announcement"] as const;

  // Build allowed sender set: the teacher and their students
  const teacher = await prisma.user.findUnique({ where: { id: teacherUserId } });
  const subjectsOfTeacher = await prisma.enrollment.findMany({ where: { userId: teacherUserId, subjectId: { not: null } }, select: { subjectId: true } });
  const teacherSubjectIds = Array.from(new Set(subjectsOfTeacher.map((e: any) => e.subjectId).filter(Boolean)));
  const sec = buildSectionId(teacher?.yearLevel, teacher?.block);
  // Students are users who match the teacher's section OR share any of the teacher's subject enrollments
  const studentIdsBySection = sec.id
    ? await prisma.enrollment
        .findMany({ where: { channelId: sec.id }, select: { userId: true } })
        .then((rows: Array<{ userId: string }>) => rows.map((r: { userId: string }) => r.userId))
    : [];
  const studentIdsBySubject = teacherSubjectIds.length
    ? await prisma.enrollment
        .findMany({ where: { subjectId: { in: teacherSubjectIds } }, select: { userId: true } })
        .then((rows: Array<{ userId: string }>) => rows.map((r: { userId: string }) => r.userId))
    : [];
  const allowedSenderIds = Array.from(new Set([teacherUserId, ...studentIdsBySection, ...studentIdsBySubject]));

  const where: any = {
    senderId: { in: allowedSenderIds },
    channel: { kind: { in: allowedKinds as unknown as string[] } },
  };
  if (subjectType) {
    (where.channel as any).kind = subjectType;
  }
  if (subjectId) {
    (where.channel as any).id = subjectId;
  }

  const query: any = {
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      text: true,
      senderName: true,
      createdAt: true,
      channelId: true,
      channel: { select: { id: true, name: true, topic: true, kind: true } },
    },
  };

  if (cursor) {
    query.cursor = { id: String(cursor) };
    query.skip = 1;
  }

  const rows = await prisma.message.findMany(query);
  let items = rows.map((m: any) => ({
    id: m.id,
    kind: "message.posted",
    actorId: m.senderId || null,
    actorName: m.senderName || null,
    subjectType: m.channel?.kind || null,
    subjectId: m.channel?.id || null,
    message: m.text,
    data: { channelName: m.channel?.name || null, channelTopic: m.channel?.topic || null },
    createdAt: m.createdAt,
  }));
  // Include recent login/logout for the teacher on first page (no cursor)
  if (!cursor) {
    const authLogs = await prisma.activityLog.findMany({
      where: { actorId: teacherUserId, kind: { in: ["auth.login", "auth.logout"] } },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: { id: true, kind: true, actorId: true, actorName: true, message: true, createdAt: true },
    });
    const mapped = authLogs.map((l: any) => ({
      id: l.id,
      kind: l.kind,
      actorId: l.actorId,
      actorName: l.actorName || null,
      subjectType: null,
      subjectId: null,
      message: l.message,
      data: null,
      createdAt: l.createdAt,
    }));
    items = [...items, ...mapped].sort((a: any, b: any) => (b.createdAt as any) - (a.createdAt as any)).slice(0, take);
  }
  const nextCursor = rows.length === take ? rows[rows.length - 1]?.id : null;
  res.json({ items, nextCursor });
});

// Auth routes (register/login/me)
applyAuthRoutes(app);

// File uploads (avatars)
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

app.get("/uploads/:key", (req, res) => {
  try {
    const key = String(req.params.key || "");
    const abs = absoluteUploadPathFromKey(key);
    if (!abs) return res.status(400).json({ error: "bad_path" });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: "not_found" });
    return res.sendFile(abs);
  } catch {
    return res.status(500).json({ error: "upload_read_failed" });
  }
});

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadsDir),
  filename: (_req: any, file: any, cb: any) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = path.extname(file.originalname || "");
    cb(null, `${unique}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

const uploadAvatarMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.post("/upload/avatar", uploadAvatarMemory.single("avatar"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no_file" });

    if (CLOUDINARY_ENABLED) {
      const b64 = req.file.buffer.toString("base64");
      const dataUri = `data:${req.file.mimetype || "image/jpeg"};base64,${b64}`;
      const uploaded = await cloudinary.uploader.upload(dataUri, {
        folder: CLOUDINARY_FOLDER,
        resource_type: "image",
      });
      return res.json({ url: uploaded.secure_url, publicId: uploaded.public_id });
    }

    // Fallback to local disk if Cloudinary not configured
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = path.extname(req.file.originalname || "") || ".jpg";
    const filename = `${unique}${ext}`;
    const abs = path.join(uploadsDir, filename);
    await fs.promises.writeFile(abs, req.file.buffer);
    const url = `/uploads/${filename}`;
    return res.json({ url });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/upload/avatar error", e);
    return res.status(500).json({ error: "upload_failed" });
  }
});

// General file upload for message attachments
app.post("/upload/file", upload.single("file"), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  const url = `/uploads/${req.file.filename}`;
  const filename = req.file.originalname || req.file.filename;
  const mimetype = req.file.mimetype || guessMimeFromName(filename);
  const size = typeof req.file.size === "number" ? req.file.size : 0;
  return res.json({ url, filename, mimetype, size });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: IS_DEV ? "lan" : "cloud", ts: Date.now() });
});

// =================== Channels: Messages (persisted) ===================
app.get("/channels/:id/messages", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    jwt.verify(token, JWT_SECRET);
    const channelId = String(req.params.id || "");
    // If symmetric DM channel, also merge legacy ids (dm-<a> and dm-<b>)
    let ids: string[] = [channelId];
    if (channelId.startsWith("dm-")) {
      const parts = channelId.split("-");
      if (parts.length === 3) {
        const a = parts[1];
        const b = parts[2];
        ids = Array.from(new Set([channelId, `dm-${a}`, `dm-${b}`]));
      }
    }
    const pins = await loadPins(channelId);
    const items = await prisma.message.findMany({
      where: { channelId: { in: ids } },
      orderBy: { createdAt: "asc" },
      take: 800,
      include: { sender: { select: { avatarUrl: true, name: true, email: true, roles: { select: { role: true } } } } },
    });
    const mapped = items.map((m: any) => mapMessageRecord(m));
    // Ensure sorted and unique by id
    const uniq: Record<string, typeof mapped[number]> = {};
    for (const m of mapped) uniq[m.id] = m;
    const merged = Object.values(uniq).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return res.json({ messages: merged, pins });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

app.post("/channels/:id/messages", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.uid } });
    const channelId = String(req.params.id || "");
    const text = String((req.body?.text ?? "").toString());
    if (!text.trim()) return res.status(400).json({ error: "text_required" });
    const roleRows = await prisma.userRole.findMany({ where: { userId: decoded.uid }, select: { role: true } });
    const senderIsTeacher = roleRows.some((row: { role: string }) => row.role === "TEACHER" || row.role === "ADMIN");
    let context: SmartContext | null = null;
    try {
      const overrides = normalizeContextMetaInput(req.body?.contextMeta);
      context = await buildContextForMessage(text, overrides);
    } catch {}
    const created = await prisma.message.create({
      data: {
        channelId,
        senderId: decoded.uid,
        senderName: user?.name || user?.email || "User",
        senderAvatarUrl: user?.avatarUrl || null,
        text,
        ...serializeContextForStorage(context),
      },
    });
    // Broadcast if socket.io is active
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const anyServer: any = (global as any).io;
      if (anyServer && typeof anyServer.to === "function") {
        anyServer.to(channelId).emit("message:new", {
          id: created.id,
          channelId: created.channelId,
          senderId: created.senderId,
          senderName: created.senderName,
          senderAvatarUrl: (created as any).senderAvatarUrl || null,
          text: created.text,
          createdAt: created.createdAt?.getTime?.() ?? (created as any).createdAt,
          priority: "normal",
          senderIsTeacher,
          context,
        });
      }
    } catch {}
    return res.status(201).json({ id: created.id });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});
// =================== Admin: Users & Roles ===================
app.get("/admin/users", requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ yearLevel: "asc" }, { block: "asc" }, { name: "asc" }, { createdAt: "desc" }],
  });
  if (users.length === 0) {
    return res.json({ users: [] });
  }

  const userIds = users.map((u: UserRecord) => u.id);
  const rolesByUser = await prisma.userRole.findMany({ where: { userId: { in: userIds } } });
  const roleMap = rolesByUser.reduce((acc: Record<string, string[]>, role: UserRoleRecord) => {
    (acc[role.userId] ||= []).push(role.role);
    return acc;
  }, {} as Record<string, string[]>);

  const subjectEnrollments = await prisma.enrollment.findMany({
    where: { userId: { in: userIds }, subjectId: { not: null } },
    select: { userId: true, subjectId: true },
  });
  const subjectMap = subjectEnrollments.reduce((acc: Record<string, string[]>, entry: SubjectEnrollmentRecord) => {
    if (!entry.subjectId) return acc;
    (acc[entry.userId] ||= []).push(entry.subjectId);
    return acc;
  }, {} as Record<string, string[]>);

  res.json({
    users: users.map((u: UserRecord) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      nickname: u.nickname,
      studentId: u.studentId,
      yearLevel: u.yearLevel,
      block: u.block,
      schedule: u.schedule,
      avatarUrl: u.avatarUrl,
      profession: u.profession,
      createdAt: u.createdAt,
      roles: roleMap[u.id] || [],
      subjects: (subjectMap[u.id] || []).sort(),
    })),
  });
});

app.post("/admin/users", requireAdmin, async (req, res) => {
  const {
    email,
    password,
    name,
    nickname,
    studentId,
    subjectCodes,
    yearLevel,
    block,
    schedule,
    avatarUrl,
    profession,
    primaryRole,
    sectionAssignments,
  } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail || !password) return res.status(400).json({ error: "email_password_required" });
  const role: "STUDENT" | "ADMIN" | "TEACHER" = (primaryRole as any) || "STUDENT";
  if (!["STUDENT", "ADMIN", "TEACHER"].includes(role)) {
    return res.status(400).json({ error: "invalid_primary_role" });
  }
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: "email_exists" });
  const passwordHash = await bcrypt.hash(password, 10);
  if (role === "STUDENT") {
    const normalize = Array.isArray(subjectCodes)
      ? subjectCodes.map((code: any) => String(code || "").trim()).filter(Boolean)
      : [];
    if (!studentId) return res.status(400).json({ error: "studentId_required" });
    if (!yearLevel) return res.status(400).json({ error: "yearLevel_required" });
    if (!block) return res.status(400).json({ error: "block_required" });
    if (normalize.length === 0) return res.status(400).json({ error: "subjects_required" });
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name || null,
        nickname: nickname || null,
        studentId: studentId || null,
        yearLevel: yearLevel || null,
        block: block || null,
        schedule: schedule || null,
        avatarUrl: avatarUrl || null,
        profession: null,
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: "STUDENT" } });
    await assignAcademicMemberships({
      userId: user.id,
      subjectCodes: normalize,
      yearLevel,
      block,
      replaceSubjects: true,
    });
    return res.status(201).json({ id: user.id });
  }

  if (role === "TEACHER" && !profession) {
    return res.status(400).json({ error: "profession_required" });
  }

  // Create Admin/Teacher
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: name || null,
      nickname: nickname || null,
      studentId: null,
      // Allow setting section for teacher at creation
      yearLevel: role === "TEACHER" ? (yearLevel || null) : null,
      block: role === "TEACHER" ? (block ? String(block).trim().toUpperCase() : null) : null,
      schedule: null,
      avatarUrl: avatarUrl || null,
      profession: role === "TEACHER" ? (profession || null) : null,
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, role } });

  // If teacher and academic info provided, assign memberships and create channels.
  if (role === "TEACHER") {
    const multi = Array.isArray(sectionAssignments) ? sectionAssignments : null;
    if (multi && multi.length > 0) {
      // Persist a primary yearLevel on the teacher profile for display/compat.
      // (Teacher can still handle multiple blocks/subjects via enrollments.)
      if (!yearLevel) {
        const first = multi.find((entry: any) => String(entry?.yearLevel || "").trim());
        const yl = first ? String(first?.yearLevel || "").trim() : "";
        if (yl) {
          await prisma.user.update({ where: { id: user.id }, data: { yearLevel: yl } });
        }
      }
      if (!block) {
        const first = multi.find((entry: any) => String(entry?.block || "").trim());
        const bl = first ? String(first?.block || "").trim().toUpperCase() : "";
        if (bl) {
          await prisma.user.update({ where: { id: user.id }, data: { block: bl } });
        }
      }
      for (const entry of multi) {
        const yl = String(entry?.yearLevel || "").trim();
        const bl = String(entry?.block || "").trim().toUpperCase();
        const subs = Array.isArray(entry?.subjectCodes)
          ? entry.subjectCodes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean)
          : [];
        if (!yl || !bl || subs.length === 0) continue;
        await assignAcademicMemberships({
          userId: user.id,
          subjectCodes: subs,
          yearLevel: yl,
          block: bl,
          replaceSubjects: false, // accumulate across sections/subjects
        });
      }
    } else {
      const normalizedSubjects = Array.isArray(subjectCodes)
        ? subjectCodes.map((c: any) => String(c || "").trim()).filter(Boolean)
        : [];
      const hasSection = Boolean(yearLevel && block);
      if (normalizedSubjects.length > 0 || hasSection) {
        await assignAcademicMemberships({
          userId: user.id,
          subjectCodes: normalizedSubjects.length > 0 ? normalizedSubjects : undefined,
          yearLevel: hasSection ? yearLevel : undefined,
          block: hasSection ? block : undefined,
          replaceSubjects: normalizedSubjects.length > 0,
        });
        if (hasSection && normalizedSubjects.length > 0) {
          await assignSectionMembershipsToStudents({
            yearLevel,
            block,
            subjectCodes: normalizedSubjects,
          });
        }
      }
    }
  }

  res.status(201).json({ id: user.id });
});

app.post("/admin/users/bulk-temp", requireAdmin, async (req, res) => {
  try {
    const {
      count,
      domain,
      password,
      role,
      yearLevel,
      block,
      subjectCodes,
      schedule,
      profession,
      namePrefix,
      nicknamePrefix,
      studentIdPrefix,
      startIndex,
    } = req.body || {};

    const n = Math.max(1, Math.min(parseInt(String(count || "500"), 10) || 500, 5000));
    const emailDomain = String(domain || "school.edu").trim().replace(/^@/, "") || "school.edu";
    const pwd = String(password || "Temp123A");
    const effectiveRole = String(role || "STUDENT").trim().toUpperCase();
    if (!["STUDENT", "TEACHER"].includes(effectiveRole)) {
      return res.status(400).json({ error: "invalid_role" });
    }

    const baseName = String(namePrefix || "Temp User").trim() || "Temp User";
    const baseNick = String(nicknamePrefix || "temp").trim() || "temp";
    const start = Math.max(1, parseInt(String(startIndex || "1"), 10) || 1);
    const passwordHash = await bcrypt.hash(pwd, 10);

    const createdIds: string[] = [];
    const skipped: number[] = [];

    if (effectiveRole === "STUDENT") {
      const yl = String(yearLevel || "1").trim() || "1";
      const bl = String(block || "B1").trim().toUpperCase() || "B1";
      const subs = Array.isArray(subjectCodes)
        ? subjectCodes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean)
        : ["SUBJ101"];
      if (subs.length === 0) return res.status(400).json({ error: "subjects_required" });
      const sidPrefix = String(studentIdPrefix || "TEMP").trim() || "TEMP";
      const sched = typeof schedule === "string" ? schedule : null;

      for (let i = 0; i < n; i++) {
        const idx = start + i;
        const email = `temp-stu-${idx}@${emailDomain}`.toLowerCase();
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists) {
          skipped.push(idx);
          continue;
        }
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            name: `${baseName} ${idx}`,
            nickname: `${baseNick}${idx}`,
            studentId: `${sidPrefix}-${idx}`,
            yearLevel: yl,
            block: bl,
            schedule: sched,
            avatarUrl: null,
            profession: null,
          },
        });
        await prisma.userRole.create({ data: { userId: user.id, role: "STUDENT" } });
        await assignAcademicMemberships({
          userId: user.id,
          subjectCodes: subs,
          yearLevel: yl,
          block: bl,
          replaceSubjects: true,
        });
        createdIds.push(user.id);
      }

      return res.status(201).json({
        requested: n,
        created: createdIds.length,
        skipped: skipped.length,
        role: "STUDENT",
        password: pwd,
        emailPattern: `temp-stu-<n>@${emailDomain}`,
        firstEmail: `temp-stu-${start}@${emailDomain}`,
        lastEmail: `temp-stu-${start + n - 1}@${emailDomain}`,
      });
    }

    const yl = typeof yearLevel === "undefined" ? null : String(yearLevel || "").trim() || null;
    const bl = String(block || "B1").trim().toUpperCase() || "B1";
    const prof = String(profession || "Teacher").trim() || "Teacher";

    for (let i = 0; i < n; i++) {
      const idx = start + i;
      const email = `temp-stu-${idx}@${emailDomain}`.trim().toLowerCase();
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        skipped.push(idx);
        continue;
      }

      // ...

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: `${baseName} ${idx}`,
          nickname: `${baseNick}${idx}`,
          studentId: null,
          yearLevel: yl,
          block: bl,
          schedule: null,
          avatarUrl: null,
          profession: prof,
        },
      });
      await prisma.userRole.create({ data: { userId: user.id, role: "TEACHER" } });
      createdIds.push(user.id);
    }

    return res.status(201).json({
      requested: n,
      created: createdIds.length,
      skipped: skipped.length,
      role: "TEACHER",
      password: pwd,
      emailPattern: `temp-tea-<n>@${emailDomain}`,
      firstEmail: `temp-tea-${start}@${emailDomain}`,
      lastEmail: `temp-tea-${start + n - 1}@${emailDomain}`,
    });
  } catch {
    return res.status(500).json({ error: "bulk_create_failed" });
  }
});

app.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const {
    name,
    nickname,
    password,
    studentId,
    subjectCodes,
    yearLevel,
    block,
    schedule,
    avatarUrl,
    profession,
    primaryRole,
  } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "not_found" });
  if (typeof primaryRole !== "undefined" && !["ADMIN", "TEACHER", "STUDENT"].includes(primaryRole)) {
    return res.status(400).json({ error: "invalid_primary_role" });
  }
  const userRoles = await prisma.userRole.findMany({ where: { userId: id } });
  const currentRoles = userRoles.map((roleEntry: UserRoleRecord) => roleEntry.role);
  const wasStudent = currentRoles.includes("STUDENT");
  const data: any = {};
  if (typeof name !== "undefined") data.name = name || null;
  if (typeof nickname !== "undefined") data.nickname = nickname || null;
  if (typeof studentId !== "undefined") data.studentId = studentId || null;
  if (typeof yearLevel !== "undefined") data.yearLevel = yearLevel || null;
  if (typeof block !== "undefined") data.block = block || null;
  if (typeof schedule !== "undefined") data.schedule = schedule || null;
  if (typeof avatarUrl !== "undefined") data.avatarUrl = avatarUrl || null;
  if (typeof profession !== "undefined") data.profession = profession || null;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  if (primaryRole && primaryRole !== "STUDENT") {
    data.studentId = null;
    data.yearLevel = null;
    data.block = null;
    data.schedule = null;
  }
  const updated = await prisma.user.update({ where: { id }, data });

  if (primaryRole) {
    await prisma.userRole.deleteMany({ where: { userId: id, role: { in: ["ADMIN", "TEACHER", "STUDENT"] } } });
    await prisma.userRole.create({ data: { userId: id, role: primaryRole } });
  }

  const normalizedSubjects = Array.isArray(subjectCodes)
    ? subjectCodes.map((code: any) => String(code || "").trim()).filter(Boolean)
    : undefined;
  const isStudentAfter = primaryRole ? primaryRole === "STUDENT" : wasStudent;

  if (isStudentAfter) {
    await assignAcademicMemberships({
      userId: id,
      subjectCodes: normalizedSubjects,
      yearLevel: updated.yearLevel,
      block: updated.block,
      previousYearLevel: user.yearLevel,
      previousBlock: user.block,
      replaceSubjects: Array.isArray(subjectCodes),
    });
  } else if (wasStudent) {
    await assignAcademicMemberships({
      userId: id,
      subjectCodes: [],
      yearLevel: null,
      block: null,
      previousYearLevel: user.yearLevel,
      previousBlock: user.block,
      replaceSubjects: true,
    });
  }
  res.json({ ok: true });
});

app.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  // Soft-delete alternative: mark as inactive (if field exists). For now, delete.
  await prisma.userRole.deleteMany({ where: { userId: id } });
  await prisma.enrollment.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
});

app.post("/admin/users/:id/roles", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { role } = req.body || {};
  if (!role) return res.status(400).json({ error: "role_required" });
  const exists = await prisma.userRole.findFirst({ where: { userId: id, role } });
  if (!exists) await prisma.userRole.create({ data: { userId: id, role } });
  res.json({ ok: true });
});

app.delete("/admin/users/:id/roles", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { role } = req.body || {};
  if (!role) return res.status(400).json({ error: "role_required" });
  await prisma.userRole.deleteMany({ where: { userId: id, role } });
  res.json({ ok: true });
});

// banners and alerts
app.get("/admin/banners", requireAdmin, async (_req, res) => {
  const banners = await prisma.banner.findMany({ orderBy: { updatedAt: "desc" } });
  res.json({ banners });
});

// =================== Teacher: Limited Banners & Alerts ===================
app.get("/teacher/banners", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const banners = await prisma.banner.findMany({
    where: { createdBy: teacherUserId },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ banners });
});

app.post("/teacher/banners", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const { title, message, kind = "info", isActive = true, startsAt, endsAt, audience } = req.body || {};

  if (!title || !message) return res.status(400).json({ error: "title_message_required" });
  if (!BANNER_KINDS.has(kind)) return res.status(400).json({ error: "invalid_kind" });

  // Ensure teacher has a section context to target their students
  const teacher = await prisma.user.findUnique({ where: { id: teacherUserId } });
  if (!teacher?.yearLevel || !teacher?.block) {
    return res.status(400).json({ error: "teacher_section_required" });
  }

  const startDate = parseDateInput(startsAt);
  if (typeof startDate === "undefined") return res.status(400).json({ error: "invalid_startsAt" });
  const endDate = parseDateInput(endsAt);
  if (typeof endDate === "undefined") return res.status(400).json({ error: "invalid_endsAt" });

  // Teacher banners are implicitly scoped by creator; visibility filtering occurs in GET /banners
  const banner = await prisma.banner.create({
    data: {
      title,
      message,
      kind,
      isActive: Boolean(isActive),
      startsAt: startDate,
      endsAt: endDate,
      createdBy: teacherUserId,
    },
  });

  // Persist audience targets (optional). Supported:
  // { type: "section" } | { type: "subject", values: string[] } | { type: "users", values: string[] }
  if (audience && typeof audience === "object" && audience.type) {
    const type = String(audience.type);
    if (type === "section") {
      const { id: secId } = buildSectionId(teacher.yearLevel, teacher.block);
      if (secId) {
        await prisma.bannerTarget.create({ data: { bannerId: banner.id, targetType: "section", targetValue: secId } });
      }
    } else if (type === "subject" && Array.isArray(audience.values)) {
      const codes = audience.values.map((v: any) => String(v || "").trim().toUpperCase()).filter(Boolean);
      if (codes.length > 0) {
        await prisma.bannerTarget.createMany({
          data: codes.map((code: string) => ({ bannerId: banner.id, targetType: "subject", targetValue: code })),
        });
      }
    } else if (type === "users" && Array.isArray(audience.values)) {
      const userIds = audience.values.map((v: any) => String(v || "").trim()).filter(Boolean);
      if (userIds.length > 0) {
        await prisma.bannerUserTarget.createMany({
          data: userIds.map((uid: string) => ({ bannerId: banner.id, userId: uid })),
        });
      }
    }
  }
  await logActivity({
    kind: "banner.create",
    actorId: teacherUserId,
    actorName: teacher?.name || null,
    subjectType: "banner",
    subjectId: banner.id,
    message: `Teacher created banner: ${title}`,
    data: { kind, isActive, startsAt: banner.startsAt, endsAt: banner.endsAt, audience: audience || null },
  });
  io.emit("banner:update");
  res.status(201).json({ banner });
});

app.patch("/teacher/banners/:id", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const id = req.params.id;
  const exists = await prisma.banner.findUnique({ where: { id } });
  if (!exists || exists.createdBy !== teacherUserId) return res.status(404).json({ error: "not_found" });

  const { title, message, kind, isActive, startsAt, endsAt, audience } = req.body || {};
  const data: any = {};
  if (typeof title !== "undefined") data.title = title;
  if (typeof message !== "undefined") data.message = message;
  if (typeof kind !== "undefined") {
    if (!BANNER_KINDS.has(kind)) return res.status(400).json({ error: "invalid_kind" });
    data.kind = kind;
  }
  if (typeof isActive !== "undefined") data.isActive = Boolean(isActive);
  if (typeof startsAt !== "undefined") {
    const startDate = parseDateInput(startsAt);
    if (typeof startDate === "undefined") return res.status(400).json({ error: "invalid_startsAt" });
    data.startsAt = startDate;
  }
  if (typeof endsAt !== "undefined") {
    const endDate = parseDateInput(endsAt);
    if (typeof endDate === "undefined") return res.status(400).json({ error: "invalid_endsAt" });
    data.endsAt = endDate;
  }
  const banner = await prisma.banner.update({ where: { id }, data });

  // Replace audience targets if provided
  if (audience && typeof audience === "object" && audience.type) {
    await prisma.bannerTarget.deleteMany({ where: { bannerId: id } });
    await prisma.bannerUserTarget.deleteMany({ where: { bannerId: id } });
    const teacher = await prisma.user.findUnique({ where: { id: teacherUserId } });
    const type = String(audience.type);
    if (type === "section") {
      const { id: secId } = buildSectionId(teacher?.yearLevel, teacher?.block);
      if (secId) await prisma.bannerTarget.create({ data: { bannerId: id, targetType: "section", targetValue: secId } });
    } else if (type === "subject" && Array.isArray(audience.values)) {
      const codes = audience.values.map((v: any) => String(v || "").trim().toUpperCase()).filter(Boolean);
      if (codes.length > 0) {
        await prisma.bannerTarget.createMany({
          data: codes.map((code: string) => ({ bannerId: id, targetType: "subject", targetValue: code })),
        });
      }
    } else if (type === "users" && Array.isArray(audience.values)) {
      const userIds = audience.values.map((v: any) => String(v || "").trim()).filter(Boolean);
      if (userIds.length > 0) {
        await prisma.bannerUserTarget.createMany({
          data: userIds.map((uid: string) => ({ bannerId: id, userId: uid })),
        });
      }
    }
  }
  await logActivity({
    kind: "banner.update",
    actorId: teacherUserId,
    actorName: (await prisma.user.findUnique({ where: { id: teacherUserId } }))?.name || null,
    subjectType: "banner",
    subjectId: banner.id,
    message: `Teacher updated banner: ${banner.title}`,
    data: { title, kind, isActive, startsAt, endsAt, audience: audience || null },
  });
  io.emit("banner:update");
  res.json({ banner });
});

app.delete("/teacher/banners/:id", requireTeacher, async (req, res) => {
  const teacherUserId = (req as any).teacherUserId as string;
  const id = req.params.id;
  const exists = await prisma.banner.findUnique({ where: { id } });
  if (!exists || exists.createdBy !== teacherUserId) return res.status(404).json({ error: "not_found" });
  await prisma.bannerTarget.deleteMany({ where: { bannerId: id } });
  await prisma.bannerUserTarget.deleteMany({ where: { bannerId: id } });
  await prisma.banner.delete({ where: { id } });
  await logActivity({
    kind: "banner.delete",
    actorId: teacherUserId,
    actorName: (await prisma.user.findUnique({ where: { id: teacherUserId } }))?.name || null,
    subjectType: "banner",
    subjectId: id,
    message: `Teacher deleted banner: ${exists.title}`,
    data: { id },
  });
  io.emit("banner:update");
  res.json({ ok: true });
});

app.get("/admin/stats/summary", requireAdmin, async (_req, res) => {
  const [users, students, teachers, admins, messages, channels] = await Promise.all([
    prisma.user.count(),
    prisma.userRole.count({ where: { role: "STUDENT" } }),
    prisma.userRole.count({ where: { role: "TEACHER" } }),
    prisma.userRole.count({ where: { role: "ADMIN" } }),
    prisma.message.count(),
    prisma.channel.count(),
  ]);
  const latestMessages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      channelId: true,
      senderName: true,
      text: true,
      createdAt: true,
      priority: true,
    },
  });
  res.json({
    users,
    roleCounts: { students, teachers, admins },
    messages,
    channels,
    latestMessages,
  });
});

app.get("/admin/stats/usage", requireAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.message.groupBy({
    by: ["createdAt"],
    where: { createdAt: { gte: cutoff } },
    _count: { id: true },
  });
  const daily = new Map<string, number>();
  grouped.forEach((row: { createdAt: Date; _count: { id: number } }) => {
    const key = row.createdAt.toISOString().split("T")[0];
    daily.set(key, (daily.get(key) || 0) + row._count.id);
  });
  const days: { date: string; messages: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().split("T")[0];
    days.push({ date: key, messages: daily.get(key) || 0 });
  }
  res.json({ period: "7d", days });
});

app.post("/admin/reset", requireAdmin, async (req, res) => {
  const confirm = String(req.body?.confirm || "");
  const recreateGeneral = Boolean(req.body?.recreateGeneral ?? true);
  if (confirm !== "RESET_EVERYTHING") {
    return res.status(400).json({ error: "confirm_required" });
  }

  const adminEmail = "admin@gmail.com";
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } }).catch(() => null);
  if (!admin) {
    const candidates = await prisma.user.findMany({
      select: { id: true, email: true },
    });
    admin = candidates.find((u: any) => typeof u.email === "string" && u.email.trim().toLowerCase() === adminEmail) || null;
  }
  if (!admin) {
    return res.status(500).json({ error: "admin_not_found" });
  }

  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.channelPin.deleteMany({});
      await tx.message.deleteMany({});
      await tx.enrollment.deleteMany({});
      await tx.bannerUserTarget.deleteMany({});
      await tx.bannerTarget.deleteMany({});
      await tx.banner.deleteMany({});
      await tx.activityLog.deleteMany({});

      await tx.userRole.deleteMany({ where: { userId: { not: admin.id } } });
      await tx.user.deleteMany({ where: { id: { not: admin.id } } });

      const adminRole = await tx.userRole.findFirst({ where: { userId: admin.id, role: "ADMIN" } });
      if (!adminRole) {
        await tx.userRole.create({ data: { userId: admin.id, role: "ADMIN" } });
      }

      if (recreateGeneral) {
        await tx.channel.upsert({
          where: { id: "gen" },
          update: { name: "General", kind: "general" },
          create: { id: "gen", name: "General", kind: "general" },
        });
      } else {
        await tx.channel.deleteMany({});
      }
    });

    return res.json({ ok: true, keptAdminEmail: admin.email, recreateGeneral });
  } catch (e) {
    return res.status(500).json({ error: "reset_failed" });
  }
});

app.post("/admin/banners", requireAdmin, async (req, res) => {
  const { title, message, kind = "info", isActive = false, startsAt, endsAt } = req.body || {};
  if (!title || !message) return res.status(400).json({ error: "title_message_required" });
  if (!BANNER_KINDS.has(kind)) return res.status(400).json({ error: "invalid_kind" });
  const startDate = parseDateInput(startsAt);
  if (typeof startDate === "undefined") return res.status(400).json({ error: "invalid_startsAt" });
  const endDate = parseDateInput(endsAt);
  if (typeof endDate === "undefined") return res.status(400).json({ error: "invalid_endsAt" });
  const createdBy = (req as any).adminUserId || null;
  const banner = await prisma.banner.create({
    data: {
      title,
      message,
      kind,
      isActive: Boolean(isActive),
      startsAt: startDate,
      endsAt: endDate,
      createdBy,
    },
  });
  io.emit("banner:update");
  res.status(201).json({ banner });
});

app.patch("/admin/banners/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { title, message, kind, isActive, startsAt, endsAt } = req.body || {};
  const exists = await prisma.banner.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ error: "not_found" });
  const data: any = {};
  if (typeof title !== "undefined") data.title = title;
  if (typeof message !== "undefined") data.message = message;
  if (typeof kind !== "undefined") {
    if (!BANNER_KINDS.has(kind)) return res.status(400).json({ error: "invalid_kind" });
    data.kind = kind;
  }
  if (typeof isActive !== "undefined") data.isActive = Boolean(isActive);
  if (typeof startsAt !== "undefined") {
    const startDate = parseDateInput(startsAt);
    if (typeof startDate === "undefined") return res.status(400).json({ error: "invalid_startsAt" });
    data.startsAt = startDate;
  }
  if (typeof endsAt !== "undefined") {
    const endDate = parseDateInput(endsAt);
    if (typeof endDate === "undefined") return res.status(400).json({ error: "invalid_endsAt" });
    data.endsAt = endDate;
  }
  const banner = await prisma.banner.update({ where: { id }, data });
  io.emit("banner:update");
  res.json({ banner });
});

app.delete("/admin/banners/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  await prisma.banner.delete({ where: { id } });
  io.emit("banner:update");
  res.json({ ok: true });
});

app.get("/banners", async (req, res) => {
  const now = new Date();

  // Determine viewer and allowed teacher creators for scoping
  let viewerId: string | null = null;
  let isAdminViewer = false;
  let teacherCreatorIds: string[] = [];
  let viewerSectionId: string | null = null;
  let viewerSubjects: string[] = [];
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");
    if (type === "Bearer" && token) {
      const decoded = jwt.verify(token, JWT_SECRET) as { uid: string; roles?: string[] };
      viewerId = decoded?.uid || null;
      isAdminViewer = Boolean(decoded?.roles?.includes("ADMIN"));
    }
  } catch {
    // ignore token parse errors; treat as unauthenticated
  }

  if (viewerId) {
    const viewer = await prisma.user.findUnique({ where: { id: viewerId } });
    if (viewer?.yearLevel && viewer?.block) {
      const teachers = await prisma.user.findMany({
        where: {
          yearLevel: viewer.yearLevel,
          block: viewer.block,
          roles: { some: { role: "TEACHER" } },
        },
        select: { id: true },
      });
      teacherCreatorIds = teachers.map((t: { id: string }) => t.id);
      const sec = buildSectionId(viewer.yearLevel, viewer.block);
      viewerSectionId = sec.id;
    }
    const enrolls = await prisma.enrollment.findMany({ where: { userId: viewerId, subjectId: { not: null } }, select: { subjectId: true } });
    viewerSubjects = enrolls.map((e: any) => e.subjectId).filter(Boolean);
  }

  const banners = await prisma.banner.findMany({
    where: {
      isActive: true,
      OR: [
        { startsAt: null, endsAt: null },
        { startsAt: { lte: now }, endsAt: null },
        { startsAt: null, endsAt: { gte: now } },
        { startsAt: { lte: now }, endsAt: { gte: now } },
      ],
      AND: [
        {
          OR: [
            // Admin-created or global banners
            { createdBy: null },
            { creator: { roles: { some: { role: "ADMIN" } } } },
            // Explicit targets: section / subject / users
            viewerId
              ? {
                  OR: [
                    // If banner has targets, require a match against section/subject/user targets
                    {
                      AND: [
                        { OR: [
                          viewerSectionId ? { targets: { some: { targetType: "section", targetValue: viewerSectionId } } } : undefined,
                          viewerSubjects.length > 0 ? { targets: { some: { targetType: "subject", targetValue: { in: viewerSubjects } } } } : undefined,
                          { userTargets: { some: { userId: viewerId } } },
                        ].filter(Boolean) as any },
                        { OR: [ { targets: { some: {} } }, { userTargets: { some: {} } } ] },
                      ],
                    },
                    // If banner has no targets, fall back to legacy section-scoped teacher banners
                    {
                      AND: [
                        { targets: { none: {} } },
                        { userTargets: { none: {} } },
                        teacherCreatorIds.length > 0 ? { createdBy: { in: teacherCreatorIds } } : { createdBy: null },
                      ],
                    },
                  ],
                }
              : {
                  AND: [
                    // If unauthenticated, only show banners that are truly global (no creator and no targets)
                    { createdBy: null },
                    { targets: { none: {} } },
                    { userTargets: { none: {} } },
                  ],
                },
          ],
        },
      ],
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
  });
  res.json({ banners });
});

// channels and messages
app.get("/channels", async (req, res) => {
  // ensure default channel exists
  await prisma.channel.upsert({
    where: { id: "gen" },
    update: { name: "General", topic: "Campus-wide", kind: "general" },
    create: { id: "gen", name: "General", topic: "Campus-wide", kind: "general" },
  });

  // If authenticated, return only channels the user is enrolled in
  let uid: string | null = null;
  let rolesFromToken: string[] | null = null;
  try {
    const token = getBearerToken(req);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET) as { uid: string; roles?: string[] };
      uid = decoded.uid || null;
      rolesFromToken = decoded.roles || null;
    }
  } catch {}

  if (uid) {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: uid, OR: [{ channelId: { not: null } }, { subjectId: { not: null } }] },
      select: { channelId: true, subjectId: true },
    });
    const chanIds = enrollments.map((e: { channelId: string | null }) => e.channelId).filter((v: string | null): v is string => Boolean(v));
    const channelIds = new Set<string>();
    if (chanIds.length > 0) {
      for (const id of chanIds) channelIds.add(id);
    } else {
      for (const e of enrollments) if (e.subjectId) channelIds.add(e.subjectId);
    }
    channelIds.add("gen");
    const list = await prisma.channel.findMany({ where: { id: { in: Array.from(channelIds) } }, orderBy: { name: "asc" } });
    return res.json({ channels: list });
  }

  // Fallback for unauthenticated callers: only General
  const list = await prisma.channel.findMany({ where: { id: { in: ["gen"] } } });
  return res.json({ channels: list });
});

app.get("/channels/:id/messages", async (req, res) => {
  const channelId = String(req.params.id || "");
  const pins = await loadPins(channelId);
  const list = await prisma.message.findMany({
    where: { channelId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { avatarUrl: true, name: true, email: true, roles: { select: { role: true } } } } },
  });
  const mapped = list.map((m: any) => mapMessageRecord(m));
  res.json({ messages: mapped, pins });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: socketCorsOriginCheck as any, credentials: true },
  transports: ["websocket", "polling"],
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || "25000", 10),
  pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || "20000", 10),
});

const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  (async () => {
    try {
      const pubClient = createClient({ url: REDIS_URL });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      // eslint-disable-next-line no-console
      console.log("[socket] redis adapter enabled");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] redis adapter init failed", e);
    }
  })();
}

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

  socket.on("user:join", (userId: string) => {
    try {
      if (!userId) return;
      socket.join(`user:${userId}`);
      // eslint-disable-next-line no-console
      console.log(`[socket] ${socket.id} joined user room user:${userId}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] user:join error", e);
    }
  });

  // WebRTC signaling relay: offer
  socket.on("webrtc:offer", (payload: { channelId: string; sdp: any; toSocketId?: string }) => {
    try {
      if (!payload?.channelId || !payload?.sdp) return;
      // eslint-disable-next-line no-console
      console.log(`[socket] webrtc:offer from=${socket.id} ch=${payload.channelId} to=${payload.toSocketId || 'room'}`);
      const msg = { channelId: payload.channelId, sdp: payload.sdp, fromSocketId: socket.id };
      if (payload.toSocketId) io.to(payload.toSocketId).emit("webrtc:offer", msg);
      else socket.to(payload.channelId).emit("webrtc:offer", msg);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] webrtc:offer error", e);
    }
  });

  // WebRTC signaling relay: answer
  socket.on("webrtc:answer", (payload: { channelId: string; sdp: any; toSocketId?: string }) => {
    try {
      if (!payload?.channelId || !payload?.sdp) return;
      // eslint-disable-next-line no-console
      console.log(`[socket] webrtc:answer from=${socket.id} ch=${payload.channelId} to=${payload.toSocketId || 'room'}`);
      const msg = { channelId: payload.channelId, sdp: payload.sdp, fromSocketId: socket.id };
      if (payload.toSocketId) io.to(payload.toSocketId).emit("webrtc:answer", msg);
      else socket.to(payload.channelId).emit("webrtc:answer", msg);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] webrtc:answer error", e);
    }
  });

  // WebRTC signaling relay: ICE candidate
  socket.on("webrtc:candidate", (payload: { channelId: string; candidate: any; toSocketId?: string }) => {
    try {
      if (!payload?.channelId || !payload?.candidate) return;
      // eslint-disable-next-line no-console
      console.log(`[socket] webrtc:candidate from=${socket.id} ch=${payload.channelId} to=${payload.toSocketId || 'room'}`);
      const msg = { channelId: payload.channelId, candidate: payload.candidate, fromSocketId: socket.id };
      if (payload.toSocketId) io.to(payload.toSocketId).emit("webrtc:candidate", msg);
      else socket.to(payload.channelId).emit("webrtc:candidate", msg);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] webrtc:candidate error", e);
    }
  });

  // Call end notification: relay to peer so they can clean up
  socket.on("call:end", (payload: { channelId: string; toSocketId?: string }) => {
    try {
      if (!payload?.channelId) return;
      // eslint-disable-next-line no-console
      console.log(`[socket] call:end from=${socket.id} ch=${payload.channelId} to=${payload.toSocketId || 'room'}`);
      const msg = { channelId: payload.channelId, fromSocketId: socket.id };
      if (payload.toSocketId) io.to(payload.toSocketId).emit("call:end", msg);
      else socket.to(payload.channelId).emit("call:end", msg);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] call:end error", e);
    }
  });

  // Call accept notification: relay to caller so they can send offer
  socket.on("call:accept", (payload: { channelId: string; toSocketId?: string }) => {
    try {
      if (!payload?.channelId) return;
      // eslint-disable-next-line no-console
      console.log(`[socket] call:accept from=${socket.id} ch=${payload.channelId} to=${payload.toSocketId || 'room'}`);
      const msg = { channelId: payload.channelId, fromSocketId: socket.id };
      if (payload.toSocketId) io.to(payload.toSocketId).emit("call:accept", msg);
      else socket.to(payload.channelId).emit("call:accept", msg);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] call:accept error", e);
    }
  });

  socket.on("message:send", async (payload: { channelId: string; text: string; senderId?: string; senderName?: string; senderAvatarUrl?: string | null; priority?: "normal" | "high" | "emergency"; contextMeta?: { filename?: string; mimetype?: string; size?: number }; }) => {
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
      let context: SmartContext | null = null;
      try {
        const overrides = normalizeContextMetaInput(payload.contextMeta);
        context = await buildContextForMessage(payload.text, overrides);
      } catch {}
      const created = await prisma.message.create({
        data: {
          channelId: payload.channelId,
          // Only save senderId when the client supplies a real user id
          senderId: payload.senderId ?? null,
          senderName: payload.senderName || "User",
          senderAvatarUrl: payload.senderAvatarUrl || null,
          text: payload.text,
          priority: payload.priority || "normal",
          ...serializeContextForStorage(context),
        },
      });
      let senderIsTeacher = false;
      if (payload.senderId) {
        const roles = await prisma.userRole.findMany({ where: { userId: payload.senderId }, select: { role: true } });
        senderIsTeacher = roles.some((row: { role: string }) => row.role === "TEACHER" || row.role === "ADMIN");
      }
      const msg = {
        id: created.id,
        channelId: created.channelId,
        senderId: created.senderId || "",
        senderName: created.senderName,
        senderAvatarUrl: created.senderAvatarUrl || null,
        text: created.text,
        createdAt: created.createdAt.getTime(),
        priority: (created.priority as any) || "normal",
        senderIsTeacher,
        context,
      };
      io.to(msg.channelId).emit("message:new", msg);
      if (msg.channelId.startsWith("dm-")) {
        const parts = msg.channelId.split("-");
        if (parts.length === 3) {
          const a = parts[1];
          const b = parts[2];
          if (a) io.to(`user:${a}`).emit("message:new", msg);
          if (b) io.to(`user:${b}`).emit("message:new", msg);
          if (a) io.to(`dm-${a}`).emit("message:new", msg);
          if (b) io.to(`dm-${b}`).emit("message:new", msg);
        } else if (parts.length === 2) {
          const other = parts[1];
          if (other) io.to(`user:${other}`).emit("message:new", msg);
          if (msg.senderId) io.to(`user:${msg.senderId}`).emit("message:new", msg);
        }
      }
      // Debug: broadcasted
      // eslint-disable-next-line no-console
      console.log(`[socket] message:new broadcast to room ${msg.channelId}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] message:send error", e);
    }
  });

  // Relay call invites to everyone joined to the channel room
  socket.on("call:invite", (payload: { channelId: string; kind: "video" | "voice"; from?: string; link?: string }) => {
    try {
      if (!payload?.channelId) return;
      // eslint-disable-next-line no-console
      console.log(`[socket] call:invite from=${socket.id} ch=${payload.channelId} kind=${payload.kind}`);
      io.to(payload.channelId).emit("call:invite", {
        channelId: payload.channelId,
        kind: payload.kind,
        from: payload.from || "User",
        link: payload.link || null,
        at: Date.now(),
        fromSocketId: socket.id,
      });
      // If this is a symmetric DM id (dm-<a>-<b>), also emit to legacy personal rooms and user rooms for reliability
      if (payload.channelId.startsWith("dm-")) {
        const parts = payload.channelId.split("-");
        if (parts.length === 3) {
          const a = parts[1];
          const b = parts[2];
          io.to(`dm-${a}`).emit("call:invite", { channelId: payload.channelId, kind: payload.kind, from: payload.from || "User", link: payload.link || null, at: Date.now(), fromSocketId: socket.id });
          io.to(`dm-${b}`).emit("call:invite", { channelId: payload.channelId, kind: payload.kind, from: payload.from || "User", link: payload.link || null, at: Date.now(), fromSocketId: socket.id });
          io.to(`user:${a}`).emit("call:invite", { channelId: payload.channelId, kind: payload.kind, from: payload.from || "User", link: payload.link || null, at: Date.now(), fromSocketId: socket.id });
          io.to(`user:${b}`).emit("call:invite", { channelId: payload.channelId, kind: payload.kind, from: payload.from || "User", link: payload.link || null, at: Date.now(), fromSocketId: socket.id });
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[socket] call:invite error", e);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on 0.0.0.0:${PORT}`);
  // Fire-and-forget admin seed
  ensureInitialAdmin().catch((e) => console.error("[seed] admin error", e));
  ensureInitialTeacher().catch((e) => console.error("[seed] teacher error", e));
});
