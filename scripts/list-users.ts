import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  console.log("\n=== 사용자 목록 ===");
  users.forEach((u, i) => {
    console.log(`${i + 1}. ${u.email} (${u.name}) - ${u.role}`);
  });
  console.log("");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
