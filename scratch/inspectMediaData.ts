import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- DIVISION MEDIA ---');
  const media = await prisma.divisionMedia.findMany({
    orderBy: { position: 'asc' }
  });
  console.dir(media, { depth: null });

  console.log('\n--- DIVISIONS ---');
  const divisions = await prisma.division.findMany({
    include: {
      media: true
    }
  });
  console.dir(divisions, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
