import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
}

export function applyAuthRoutes(app: Express) {
  // Register
  app.post("/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name, nickname, avatarUrl, studentId, yearLevel, block, subjectCodes } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: "email and password are required" });

      // Password policy: at least 1 uppercase letter and 1 number, min length 6
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      if (!(hasUpper && hasNumber) || password.length < 6) {
        return res.status(400).json({ error: "password_must_include_uppercase_and_number_min6" });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "email already registered" });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: name || null,
          nickname: nickname || null,
          studentId: studentId || null,
          yearLevel: yearLevel || null,
          block: block || null,
          avatarUrl: avatarUrl || null,
        },
      });

      // Optional: process subject codes -> upsert into Subject and link via Enrollment
      if (Array.isArray(subjectCodes) && subjectCodes.length > 0) {
        for (const codeRaw of subjectCodes) {
          const code = String(codeRaw).trim().toUpperCase();
          if (!code) continue;
          await prisma.subject.upsert({
            where: { id: code },
            update: {},
            create: { id: code },
          });
          await prisma.enrollment.create({
            data: {
              userId: user.id,
              subjectId: code,
            },
          });
        }
      }

      const token = signToken({ uid: user.id, email: user.email });
      return res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          nickname: user.nickname,
          studentId: user.studentId,
          yearLevel: user.yearLevel,
          block: user.block,
          avatarUrl: user.avatarUrl,
        },
        token,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/auth/register error", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });

  // Login
  app.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: "email and password are required" });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(401).json({ error: "invalid_credentials" });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "invalid_credentials" });

      const token = signToken({ uid: user.id, email: user.email });
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          nickname: user.nickname,
          studentId: user.studentId,
          yearLevel: user.yearLevel,
          section: user.section,
          block: user.block,
          avatarUrl: user.avatarUrl,
        },
        token,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/auth/login error", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });

  // Me
  app.get("/me", async (req: Request, res: Response) => {
    try {
      const token = getBearerToken(req);
      if (!token) return res.status(401).json({ error: "unauthorized" });
      const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.uid } });
      if (!user) return res.status(404).json({ error: "not_found" });
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          nickname: user.nickname,
          studentId: user.studentId,
          yearLevel: user.yearLevel,
          block: user.block,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (err) {
      return res.status(401).json({ error: "unauthorized" });
    }
  });
}
