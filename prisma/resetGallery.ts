import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Querying all project galleries...');
  const galleries = await prisma.projectGallery.findMany();
  console.log('Current galleries:', galleries);

  for (const gallery of galleries) {
    console.log(`Resetting gallery for project ${gallery.projectId}...`);
    await prisma.projectGallery.update({
      where: { id: gallery.id },
      data: {
        currentStatus: 'UPLOADED',
        selectionLocked: false,
        submittedAt: null,
        submittedBy: null
      }
    });
  }
  console.log('✅ All galleries reset successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Reset script error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
