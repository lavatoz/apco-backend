import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userId = 'a12ed638-9809-4533-8f64-0ca55fe841d8';
  console.log(`Querying user by ID: ${userId}...`);
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      mfaEnabled: true,
      emailVerified: true,
      mustChangePassword: true,
      lockedUntil: true,
      linkedClientId: true,
    },
  });
  
  console.log("RESULT:", JSON.stringify(user, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
