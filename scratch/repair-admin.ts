import { prisma } from '../src/config/database';
import argon2 from 'argon2';

async function main() {
  console.log('🔄 Starting admin credential repair utility...');

  const email = 'admin@apco.local';
  const password = 'Admin@123';

  // 1. Generate a new Argon2id hash using the application's existing parameters
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  // 2. Find the existing user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.error(`❌ Error: User with email ${email} not found.`);
    process.exit(1);
  }

  // 3. Update only the specified fields on this user
  const updatedUser = await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      emailVerified: true,
      role: 'SystemAdmin',
    },
  });

  // 4. Print success message and user summary
  console.log('✅ Admin account has been successfully repaired.');
  console.log('Summary of updated user:');
  console.log({
    id: updatedUser.id,
    email: updatedUser.email,
    role: updatedUser.role,
    emailVerified: updatedUser.emailVerified,
    failedLoginAttempts: updatedUser.failedLoginAttempts,
    lockedUntil: updatedUser.lockedUntil,
    passwordHashExists: !!updatedUser.passwordHash,
  });
}

main()
  .catch((e) => {
    console.error('❌ Maintenance utility failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
