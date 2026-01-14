import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "spagettimaker@outlook.com";

  const user = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
  });

  console.log(`\n✅ ${user.email} (${user.name}) → ADMIN 권한 부여 완료\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
