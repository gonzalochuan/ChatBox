import "dotenv/config";
import prisma from "./prisma.js";
import bcrypt from "bcryptjs";

// Jejemon-style / unique Filipino nicknames
const nicknames = [
  "xX_JhayRuzzXx", "PrinCessAiah", "LhadyKhat", "JhunLhoyd", "KhrizTian",
  "MhikhaiL", "JhennElyn", "RhoSell", "KhrisTine", "JhayRuz",
  "Lhordz", "PrinCezz", "JhunPyot", "MhaiKul", "Dhennise",
  "KhryzAnne", "JhayMeeh", "LhadyDhiane", "RhonEl", "MharkLhoyd",
  "JhenniFer", "KhristOff", "LhadyJhane", "MhikElla", "JhayRell",
  "PrinCeJhay", "LhadyMhay", "KhryzEl", "JhunMark", "DhianneRose",
  "MhichaelAngelo", "JhayRuzell", "LhadyKhim", "PrinCezzAnne", "JhunLhoy",
  "MhaiRuz", "KhristIan", "LhadyJhen", "JhayMhark", "DhellBoy",
  "MhikOng", "JhayRuzzell", "LhadyDhiane", "PrinCessJhay", "JhunKhris",
  "MhaiRose", "KhryzJhay", "LhadyMhikaela", "JhayLhord", "DhennMhark"
];

const lastNames = [
  "Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Torres", "Flores",
  "Gonzales", "Rivera", "Castillo", "Perez", "Ramos", "Aquino", "Villanueva",
  "Cruz", "Bautista", "Fernandez", "Morales", "Gomez", "Hernandez", "Diaz",
  "Moreno", "Navarro", "Aguilar", "Ortega", "Salazar", "Vargas", "Luna",
  "Sanchez", "Alvarez", "Castro", "Romero", "Medina", "Suarez", "Gutierrez",
  "Herrera", "Mendez", "Rojas", "Valdez", "Espinoza", "Cabrera", "Marquez",
  "León", "Guerrero", "Serrano", "Ortiz", "Ibarra", "Pascual", "Domingo", "Soriano"
];

const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const blocks = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"];

async function seedStudents() {
  console.log("Seeding 50 students with jejemon names...");
  
  const password = "Student123";
  const passwordHash = await bcrypt.hash(password, 10);
  
  const created: string[] = [];
  
  // First, delete existing seeded students
  console.log("Cleaning up previously seeded students...");
  const existingStudents = await prisma.user.findMany({
    where: { email: { startsWith: "student" } },
    select: { id: true }
  });
  
  for (const student of existingStudents) {
    await prisma.userRole.deleteMany({ where: { userId: student.id } });
    await prisma.user.delete({ where: { id: student.id } });
  }
  console.log(`Deleted ${existingStudents.length} existing students`);
  
  for (let i = 0; i < 50; i++) {
    const nickname = nicknames[i];
    const lastName = lastNames[i % lastNames.length];
    const fullName = `${nickname} ${lastName}`;
    const email = `student${i + 1}@seait.edu`;
    const studentId = `STU-2024-${String(i + 1).padStart(4, "0")}`;
    const yearLevel = yearLevels[i % 4];
    const block = blocks[i % 14];
    
    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: fullName,
          nickname,
          studentId,
          yearLevel,
          block,
          avatarUrl: null,
          profession: null,
        },
      });
      
      await prisma.userRole.create({
        data: { userId: user.id, role: "STUDENT" },
      });
      
      created.push(user.id);
      console.log(`Created: ${fullName} (${email}) - ${yearLevel} Block ${block}`);
    } catch (error) {
      console.error(`Error creating ${email}:`, error);
    }
  }
  
  console.log(`\nDone! Created ${created.length} students.`);
  console.log(`Default password: ${password}`);
  console.log(`Email format: student1@seait.edu to student50@seait.edu`);
  
  await prisma.$disconnect();
}

seedStudents().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});
