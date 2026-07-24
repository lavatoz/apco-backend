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

  // Seed/update public divisions with exact Instagram URLs
  console.log('📦 Seeding public divisions...');
  
  const divisionsToSeed = [
    {
      id: '9bcd77ca-2666-4828-ac1d-d524dcd57a3d',
      name: 'AAHA Kalyanam',
      description: 'Premium cinematic wedding photography and film production house.',
      instagramUrl: 'https://www.instagram.com/aahakalyanam.from.apco?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==',
      published: true,
      media: [
        { id: '1d279cef-bc97-4932-b3e4-33abdec2398b', fileId: 'img1', position: 1, type: 'IMAGE', url: '/api/public/divisions/media/img1' },
        { id: '2b8ede39-3928-43f9-9e39-5ea51c168f91', fileId: 'img2', position: 2, type: 'IMAGE', url: '/api/public/divisions/media/img2' },
        { id: '2bec823c-f6e7-4f4c-b126-301c3b3f8ee5', fileId: 'img3', position: 3, type: 'IMAGE', url: '/api/public/divisions/media/img3' }
      ]
    },
    {
      id: '6c4fe248-2503-41f2-891f-777d69cf920b',
      name: 'Tiny Toes',
      description: 'Creative fine art newborn, baby, and maternity portraiture.',
      instagramUrl: 'https://www.instagram.com/tinytoes.from.apco?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==',
      published: true,
      media: [
        { id: 'ca0cea98-f2d2-4317-a116-17bf14af99de', fileId: 'img4', position: 1, type: 'IMAGE', url: '/api/public/divisions/media/img4' },
        { id: '6a12baa2-58b2-46e9-8d55-09c2c3676ced', fileId: 'img5', position: 2, type: 'IMAGE', url: '/api/public/divisions/media/img5' },
        { id: 'ebd9a36b-ce6f-4d34-83f9-27f208c815cb', fileId: 'img6', position: 3, type: 'IMAGE', url: '/api/public/divisions/media/img6' }
      ]
    }
  ];

  for (const div of divisionsToSeed) {
    const existingDiv = await prisma.division.findUnique({
      where: { id: div.id }
    });

    if (existingDiv) {
      console.log(`Updating division ${div.name} with URL ${div.instagramUrl}...`);
      await prisma.division.update({
        where: { id: div.id },
        data: {
          name: div.name,
          description: div.description,
          instagramUrl: div.instagramUrl,
          published: div.published
        }
      });
    } else {
      console.log(`Creating division ${div.name}...`);
      await prisma.division.create({
        data: {
          id: div.id,
          name: div.name,
          description: div.description,
          instagramUrl: div.instagramUrl,
          published: div.published
        }
      });
    }

    // Seed/update media
    for (const m of div.media) {
      const existingMedia = await prisma.divisionMedia.findUnique({
        where: { id: m.id }
      });

      if (existingMedia) {
        await prisma.divisionMedia.update({
          where: { id: m.id },
          data: {
            position: m.position,
            url: m.url,
            fileId: m.fileId
          }
        });
      } else {
        await prisma.divisionMedia.create({
          data: {
            id: m.id,
            divisionId: div.id,
            type: 'IMAGE',
            position: m.position,
            url: m.url,
            fileId: m.fileId
          }
        });
      }
    }
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

