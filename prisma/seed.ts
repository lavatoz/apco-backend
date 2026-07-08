import { PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
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

  // Seed default Standalone Agreement Template
  const templateName = 'Wedding Photography & Videography Agreement';
  const existingTemplate = await prisma.standaloneAgreementTemplate.findFirst({
    where: { name: templateName },
  });

  if (!existingTemplate) {
    console.log(`📄 Seeding default Standalone Agreement Template...`);
    const templateFilePath = path.join(__dirname, '../src/templates/wedding-agreement.txt');

    if (fs.existsSync(templateFilePath)) {
      const content = fs.readFileSync(templateFilePath, 'utf8');
      await prisma.standaloneAgreementTemplate.create({
        data: {
          name: templateName,
          version: '1.0',
          content,
          isActive: true,
        },
      });
      console.log('✅ Default Standalone Agreement Template seeded successfully.');
    } else {
      console.warn(`⚠️ Template text file not found at ${templateFilePath}. Skipping template seed.`);
    }
  } else {
    console.log('ℹ️ Default Standalone Agreement Template already exists. Skipping template seed.');
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

