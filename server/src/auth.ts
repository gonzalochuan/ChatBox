import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "./prisma.js";
import { assignAcademicMemberships } from "./academic.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";

type RoleRow = { role: string };

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
      const { email, password, name, nickname, avatarUrl, studentId, yearLevel, block, subjectCodes, schedule } = req.body || {};
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (!normalizedEmail || !password) return res.status(400).json({ error: "email and password are required" });

      // Students are pre-provisioned by admin import. Public registration is disabled to prevent impersonation.
      // Use POST /auth/claim-student to claim a pre-imported student account.
      return res.status(403).json({ error: "student_registration_disabled_use_claim" });

      // Password policy: at least 1 uppercase letter and 1 number, min length 6
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      if (!(hasUpper && hasNumber) || password.length < 6) {
        return res.status(400).json({ error: "password_must_include_uppercase_and_number_min6" });
      }

      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) return res.status(409).json({ error: "email_exists" });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name || null,
          nickname: nickname || null,
          studentId: studentId || null,
          yearLevel: yearLevel || null,
          block: block || null,
          avatarUrl: avatarUrl || null,
          schedule: schedule || null,
        },
      });

      // Assign default role STUDENT
      await prisma.userRole.create({ data: { userId: user.id, role: "STUDENT" } });
      await assignAcademicMemberships({
        userId: user.id,
        subjectCodes,
        yearLevel,
        block,
      });

      const roles = await prisma.userRole.findMany({ where: { userId: user.id } });
      const token = signToken({ uid: user.id, email: user.email, roles: (roles as RoleRow[]).map((r: RoleRow) => r.role) });
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
          roles: (roles as RoleRow[]).map((r: RoleRow) => r.role),
        },
        token,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/auth/register error", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });

  // Claim a pre-provisioned student account by verifying email + studentId
  app.post("/auth/claim-student", async (req: Request, res: Response) => {
    try {
      const { email, studentId, tempPassword, newPassword } = req.body || {};
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      const normalizedStudentId = typeof studentId === "string" ? studentId.trim() : "";
      const providedTempPassword = typeof tempPassword === "string" ? tempPassword : "";
      const password = typeof newPassword === "string" ? newPassword : "";

      if (!normalizedEmail || !normalizedStudentId || !providedTempPassword || !password) {
        return res.status(400).json({ error: "email_studentId_tempPassword_newPassword_required" });
      }

      // Password policy: at least 1 uppercase letter and 1 number, min length 6
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      if (!(hasUpper && hasNumber) || password.length < 6) {
        return res.status(400).json({ error: "password_must_include_uppercase_and_number_min6" });
      }

      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) return res.status(404).json({ error: "account_not_found" });

      const isStudent = await prisma.userRole.findFirst({ where: { userId: user.id, role: "STUDENT" }, select: { id: true } });
      if (!isStudent) return res.status(403).json({ error: "not_student" });

      const storedStudentId = String(user.studentId || "").trim();
      if (!storedStudentId || storedStudentId !== normalizedStudentId) {
        return res.status(403).json({ error: "studentId_mismatch" });
      }

      // Prevent re-claim once the real user has claimed the account.
      if ((user as any).claimedAt) {
        return res.status(409).json({ error: "already_claimed" });
      }

      // Require knowledge of the temporary password provided by admin.
      const tempOk = await bcrypt.compare(providedTempPassword, user.passwordHash).catch(() => false);
      if (!tempOk) return res.status(401).json({ error: "invalid_temp_password" });

      const passwordHash = await bcrypt.hash(password, 10);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          claimedAt: new Date(),
        },
      });

      const roles = await prisma.userRole.findMany({ where: { userId: updated.id } });
      const token = signToken({ uid: updated.id, email: updated.email, roles: (roles as RoleRow[]).map((r: RoleRow) => r.role) });

      return res.status(200).json({
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          nickname: updated.nickname,
          studentId: updated.studentId,
          yearLevel: updated.yearLevel,
          block: updated.block,
          avatarUrl: updated.avatarUrl,
          claimedAt: (updated as any).claimedAt || null,
          roles: (roles as RoleRow[]).map((r: RoleRow) => r.role),
        },
        token,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/auth/claim-student error", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });

  // Login
  app.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (!normalizedEmail || !password) return res.status(400).json({ error: "email and password are required" });

      let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        const candidates = await prisma.user.findMany({
          where: {
            email: {
              contains: "@",
            },
          },
          select: {
            id: true,
            email: true,
            passwordHash: true,
          },
        });
        user =
          candidates.find((u: any) => typeof u.email === "string" && u.email.trim().toLowerCase() === normalizedEmail) ||
          null;
      }
      if (!user) return res.status(401).json({ error: "invalid_credentials" });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "invalid_credentials" });

      let roles: Array<{ role: string }> = await prisma.userRole.findMany({ where: { userId: user.id } });
      if ((!roles || roles.length === 0) && user.email.toLowerCase() === "admin@gmail.com") {
        await prisma.userRole.create({ data: { userId: user.id, role: "ADMIN" } });
        roles = await prisma.userRole.findMany({ where: { userId: user.id } });
      }
      const token = signToken({ uid: user.id, email: user.email, roles: roles.map((r: { role: string }) => r.role) });
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
          roles: roles.map((r: { role: string }) => r.role),
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
      let roles: Array<{ role: string }> = await prisma.userRole.findMany({ where: { userId: user.id } });
      if ((!roles || roles.length === 0) && user.email.toLowerCase() === "admin@gmail.com") {
        await prisma.userRole.create({ data: { userId: user.id, role: "ADMIN" } });
        roles = await prisma.userRole.findMany({ where: { userId: user.id } });
      }
      const subjectEnrollments = await prisma.enrollment.findMany({
        where: { userId: user.id, subjectId: { not: null } },
        select: { subjectId: true },
      });
      const subjectCodes = Array.from(
        new Set(
          (Array.isArray(subjectEnrollments) ? subjectEnrollments : [])
            .map((e: any) => e.subjectId)
            .filter(Boolean)
            .map((v: any) => String(v)),
        ),
      );
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
          roles: roles.map((r: { role: string }) => r.role),
          subjectCodes,
        },
      });
    } catch (err) {
      return res.status(401).json({ error: "unauthorized" });
    }
  });

  app.patch("/me", async (req: Request, res: Response) => {
    try {
      const token = getBearerToken(req);
      if (!token) return res.status(401).json({ error: "unauthorized" });
      const decoded = jwt.verify(token, JWT_SECRET) as { uid: string };
      const { name, nickname, schedule, avatarUrl, yearLevel, block, subjectCodes } = req.body || {};
      const roles = await prisma.userRole.findMany({ where: { userId: decoded.uid } });
      const roleNames = (roles as RoleRow[]).map((r: RoleRow) => r.role);
      const isAdmin = roleNames.includes("ADMIN");
      const data: any = {};
      if (typeof name !== "undefined") data.name = name || null;
      if (typeof nickname !== "undefined") data.nickname = nickname || null;
      if (typeof schedule !== "undefined") data.schedule = schedule || null;
      if (typeof avatarUrl !== "undefined") data.avatarUrl = avatarUrl || null;
      if (!isAdmin) {
        if (typeof yearLevel !== "undefined") data.yearLevel = yearLevel || null;
        if (typeof block !== "undefined") data.block = block || null;
      }

      const before = await prisma.user.findUnique({ where: { id: decoded.uid }, select: { yearLevel: true, block: true } });
      const updated = await prisma.user.update({ where: { id: decoded.uid }, data });

      if (!isAdmin) {
        const normalizedSubjects = Array.isArray(subjectCodes)
          ? subjectCodes.map((code: any) => String(code || "").trim()).filter(Boolean)
          : undefined;
        const shouldReplace = Array.isArray(subjectCodes);
        const hasYearOrBlock = typeof yearLevel !== "undefined" || typeof block !== "undefined";
        if (shouldReplace || hasYearOrBlock) {
          await assignAcademicMemberships({
            userId: updated.id,
            subjectCodes: normalizedSubjects,
            yearLevel: updated.yearLevel,
            block: updated.block,
            previousYearLevel: before?.yearLevel ?? null,
            previousBlock: before?.block ?? null,
            replaceSubjects: shouldReplace,
          });
        }
      }
      return res.json({
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          nickname: updated.nickname,
          studentId: updated.studentId,
          yearLevel: updated.yearLevel,
          block: updated.block,
          avatarUrl: updated.avatarUrl,
          schedule: updated.schedule,
        },
      });
    } catch (err) {
      return res.status(401).json({ error: "unauthorized" });
    }
  });
}
