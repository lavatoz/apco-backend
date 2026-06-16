import { PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Starting admin credential update script...');

  const oldEmail = 'admin@apco.local';
  const newEmail = 'admin@apco';
  const password = '123456';

  // Hash new password using Argon2
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Check if admin@apco.local exists
  const existingOldAdmin = await prisma.user.findUnique({
    where: { email: oldEmail },
  });

  if (existingOldAdmin) {
    console.log(`Found account ${oldEmail}. Updating email to ${newEmail} and setting password...`);
    await prisma.user.update({
      where: { email: oldEmail },
      data: {
        email: newEmail,
        passwordHash,
        mustChangePassword: false, // Set to false to bypass forced change
        emailVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log('✅ Admin account updated successfully.');
  } else {
    // Check if new admin@apco already exists
    const existingNewAdmin = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingNewAdmin) {
      console.log(`Found account ${newEmail}. Setting password...`);
      await prisma.user.update({
        where: { email: newEmail },
        data: {
          passwordHash,
          mustChangePassword: false,
          emailVerified: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      console.log('✅ Admin password updated successfully.');
    } else {
      console.log(`Neither ${oldEmail} nor ${newEmail} was found. Creating a new SystemAdmin account...`);
      await prisma.user.create({
        data: {
          email: newEmail,
          passwordHash,
          firstName: 'System',
          lastName: 'Admin',
          role: Role.SystemAdmin,
          mustChangePassword: false,
          emailVerified: true,
        },
      });
      console.log('✅ New Admin account created successfully.');
    }
  }
}

main()
  .catch((e) => {
    console.error('❌ Update script error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
