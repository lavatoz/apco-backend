import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = 'bro@gmail.com';
  const password = '123456';

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await prisma.user.findFirst({
    where: { email }
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        emailVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: 'Active'
      }
    });
    console.log(`✅ Set password for client ${email} to ${password}`);
  } else {
    console.error(`❌ User ${email} not found!`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
