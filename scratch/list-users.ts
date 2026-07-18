import { prisma } from '../src/config/database';

async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    }
  });
  console.log(JSON.stringify(users, null, 2));
}

listUsers().finally(() => prisma.$disconnect());
