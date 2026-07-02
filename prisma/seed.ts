import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleName } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const roles: RoleName[] = ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"];
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.log("Roles seeded. Set ADMIN_EMAIL in .env to also seed a super admin user.");
    return;
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  let user = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!user) {
    const generatedPassword = randomBytes(9).toString("base64url");
    user = await prisma.user.create({
      data: { email: adminEmail, name: "Super Admin", passwordHash: await bcrypt.hash(generatedPassword, 12) },
    });
    console.log(`Created super admin ${adminEmail} with temporary password: ${generatedPassword}`);
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    create: { userId: user.id, roleId: superAdminRole.id },
    update: {},
  });
  console.log(`${adminEmail} now has the SUPER_ADMIN role.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
