import { PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    console.log('⚠️ Seed script skipped in production environment.');
    return;
  }

  console.log('🌱 Starting database seeding...');

  const adminEmail = 'admin@apco.local';
  const defaultPassword = 'ApcoAdminPassword123!';

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    console.log(`👤 Seeding default SystemAdmin user (${adminEmail})...`);
    
    // Hash password using Argon2
    const passwordHash = await argon2.hash(defaultPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'System',
        lastName: 'Admin',
        role: Role.SystemAdmin,
        mustChangePassword: false,
        emailVerified: true,
      },
    });

    console.log('✅ Default SystemAdmin seeded successfully.');
  } else {
    console.log('ℹ️ Default SystemAdmin user already exists. Skipping user seed.');
  }

  console.log('🌱 Seeding completed.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
