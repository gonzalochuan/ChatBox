import prisma from "./prisma.js";

interface AcademicParams {
  userId: string;
  subjectCodes?: string[] | null;
  yearLevel?: string | null;
  block?: string | null;
  previousYearLevel?: string | null;
  previousBlock?: string | null;
  replaceSubjects?: boolean;
}

function normalizeSubjectCodes(codes?: string[] | null): string[] {
  if (!Array.isArray(codes)) return [];
  const unique = new Set<string>();
  for (const raw of codes) {
    const normalized = String(raw || "").trim().toUpperCase();
    if (normalized.length > 0) unique.add(normalized);
  }
  return Array.from(unique);
}

export function buildSectionId(yearLevel?: string | null, block?: string | null): { id: string | null; name: string | null } {
  if (!yearLevel || !block) return { id: null, name: null };
  const year = String(yearLevel).trim();
  const blockNormalized = String(block).trim().toUpperCase();
  if (!year || !blockNormalized) return { id: null, name: null };
  return {
    id: `SEC-${year}-${blockNormalized}`,
    name: `Section ${year}-${blockNormalized}`,
  };
}

export async function assignAcademicMemberships({
  userId,
  subjectCodes,
  yearLevel,
  block,
  previousYearLevel,
  previousBlock,
  replaceSubjects = false,
}: AcademicParams) {
  const normalizedSubjects = normalizeSubjectCodes(subjectCodes);

  const { id: newSectionId, name: newSectionName } = buildSectionId(yearLevel, block);

  if (normalizedSubjects.length > 0) {
    if (replaceSubjects) {
      const existingSubjectEnrollments = await prisma.enrollment.findMany({
        where: { userId, subjectId: { not: null } },
        select: { subjectId: true },
      });
      const keep = new Set(normalizedSubjects);
      const subjectsToRemove: string[] = [];
      for (const enrollment of existingSubjectEnrollments) {
        const subjectId = enrollment.subjectId;
        if (subjectId && !keep.has(subjectId)) {
          subjectsToRemove.push(subjectId);
        }
      }
      if (subjectsToRemove.length > 0) {
        await prisma.enrollment.deleteMany({ where: { userId, subjectId: { in: subjectsToRemove } } });
        await prisma.enrollment.deleteMany({ where: { userId, channelId: { in: subjectsToRemove } } });
      }
    }

    for (const code of normalizedSubjects) {
      await prisma.subject.upsert({
        where: { id: code },
        update: {},
        create: { id: code },
      });
      const hasAcademicEnrollment = await prisma.enrollment.findFirst({
        where: { userId, subjectId: code },
        select: { id: true },
      });
      if (!hasAcademicEnrollment) {
        await prisma.enrollment.create({ data: { userId, subjectId: code } });
      }
      const isSectionScoped = Boolean(newSectionId);
      const channelId = isSectionScoped ? `${newSectionId}::${code}` : code;
      const channelName = isSectionScoped && newSectionName ? `${newSectionName}, ${code}` : code;
      const channelKind = isSectionScoped ? "section-subject" : "subject";
      await prisma.channel.upsert({
        where: { id: channelId },
        update: { name: channelName, kind: channelKind },
        create: { id: channelId, name: channelName, kind: channelKind },
      });
      const hasChannelEnrollment = await prisma.enrollment.findFirst({
        where: { userId, channelId },
        select: { id: true },
      });
      if (!hasChannelEnrollment) {
        await prisma.enrollment.create({ data: { userId, channelId } });
      }
      if (isSectionScoped) {
        // Ensure legacy subject-level channels are removed for this user.
        await prisma.enrollment.deleteMany({ where: { userId, channelId: code } });
      }
    }
  } else if (replaceSubjects) {
    await prisma.enrollment.deleteMany({ where: { userId, subjectId: { not: null } } });
    await prisma.enrollment.deleteMany({ where: { userId, channel: { kind: "subject" } } });
  }
  const { id: previousSectionId } = buildSectionId(previousYearLevel, previousBlock);

  if (previousSectionId && previousSectionId !== newSectionId) {
    await prisma.enrollment.deleteMany({ where: { userId, channelId: previousSectionId } });
  }

  if (newSectionId && newSectionName) {
    await prisma.channel.upsert({
      where: { id: newSectionId },
      update: {},
      create: { id: newSectionId, name: newSectionName, kind: "section" },
    });
    const hasSectionEnrollment = await prisma.enrollment.findFirst({
      where: { userId, channelId: newSectionId },
      select: { id: true },
    });
    if (!hasSectionEnrollment) {
      await prisma.enrollment.create({ data: { userId, channelId: newSectionId } });
    }
  }

  if (replaceSubjects && newSectionId && normalizedSubjects.length > 0) {
    const keepChannelIds = normalizedSubjects.map((code) => `${newSectionId}::${code}`);
    await prisma.enrollment.deleteMany({
      where: {
        userId,
        channelId: {
          startsWith: `${newSectionId}::`,
          notIn: keepChannelIds,
        },
      },
    });
  }

  // Ensure global "General" channel exists and user is enrolled
  await prisma.channel.upsert({
    where: { id: "gen" },
    update: { name: "General", kind: "general", topic: "Campus-wide" },
    create: { id: "gen", name: "General", kind: "general", topic: "Campus-wide" },
  });
  const generalEnrollment = await prisma.enrollment.findFirst({ where: { userId, channelId: "gen" }, select: { id: true } });
  if (!generalEnrollment) {
    await prisma.enrollment.create({ data: { userId, channelId: "gen" } });
  }
}

export async function assignSectionMembershipsToStudents({
  yearLevel,
  block,
  subjectCodes,
}: {
  yearLevel: string;
  block: string;
  subjectCodes: string[];
}) {
  const { id: sectionId } = buildSectionId(yearLevel, block);
  if (!sectionId) return;
  const students = await prisma.user.findMany({
    where: {
      yearLevel,
      block,
      roles: { some: { role: "STUDENT" } },
    },
    select: { id: true },
  });
  if (students.length === 0) return;
  const tasks = students.map(({ id }: { id: string }) =>
    assignAcademicMemberships({
      userId: id,
      subjectCodes,
      yearLevel,
      block,
      replaceSubjects: true,
    }),
  );
  try {
    await Promise.all(tasks);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("assignSectionMembershipsToStudents error", { yearLevel, block, count: students.length, error });
    throw error;
  }
}
