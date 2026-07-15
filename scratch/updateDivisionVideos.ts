import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Updating division videos to intended production video IDs...');

  // Update AAHA Kalyanam Video (position 4)
  const aahaUpdate = await prisma.divisionMedia.updateMany({
    where: {
      type: 'VIDEO',
      position: 4,
      division: {
        name: 'AAHA Kalyanam'
      }
    },
    data: {
      fileId: '1x-cYEXHO_muHVSxJCZSRoO9gIh3_L4KI',
      url: 'https://drive.google.com/uc?id=1x-cYEXHO_muHVSxJCZSRoO9gIh3_L4KI'
    }
  });
  console.log(`Updated ${aahaUpdate.count} record(s) for AAHA Kalyanam.`);

  // Update Tiny Toes Video (position 4)
  const tinyUpdate = await prisma.divisionMedia.updateMany({
    where: {
      type: 'VIDEO',
      position: 4,
      division: {
        name: 'Tiny Toes'
      }
    },
    data: {
      fileId: '1A8bfOmQvz5GIQw64RTUe84IOkI85bnTQ',
      url: 'https://drive.google.com/uc?id=1A8bfOmQvz5GIQw64RTUe84IOkI85bnTQ'
    }
  });
  console.log(`Updated ${tinyUpdate.count} record(s) for Tiny Toes.`);

  console.log('\n--- VERIFYING CURRENT DB STATE ---');
  const media = await prisma.divisionMedia.findMany({
    where: { type: 'VIDEO' },
    include: {
      division: {
        select: { name: true }
      }
    }
  });
  console.dir(media, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
