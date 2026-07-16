import { prisma } from '../src/config/database';
import { verifyPassword } from '../src/utils/hash';
import argon2 from 'argon2';

async function main() {
  console.log('🔄 Starting one-time production admin repair utility...');

  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is not defined.');
    process.exit(1);
  }

  // Mask database credentials for safe logging
  const maskedDbUrl = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`Connecting to database: ${maskedDbUrl}`);

  const email = 'admin@apco.local';
  const password = 'Admin@123';

  // 1. Generate Argon2id hash using application parameters
  console.log('Generating password hash...');
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // 2. Find the existing user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.error(`❌ Error: User with email ${email} not found in the database.`);
    process.exit(1);
  }

  // 3. Update the user in the database
  console.log('Updating user record in the database...');
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

  console.log('✅ Database update completed.');

  // 4. Verify password verification works using verifyPassword
  console.log('Verifying password hash compatibility using verifyPassword()...');
  const isMatch = await verifyPassword(updatedUser.passwordHash || '', password);
  if (!isMatch) {
    console.error('❌ Error: The updated hash failed verification against the password.');
    process.exit(1);
  }

  console.log('✅ Verification succeeded!');
  console.log('Summary of repaired user:');
  console.log({
    id: updatedUser.id,
    email: updatedUser.email,
    role: updatedUser.role,
    emailVerified: updatedUser.emailVerified,
    failedLoginAttempts: updatedUser.failedLoginAttempts,
    lockedUntil: updatedUser.lockedUntil,
    passwordVerifiedSuccessfully: isMatch,
  });
}

main()
  .catch((e) => {
    console.error('❌ Production repair utility failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
