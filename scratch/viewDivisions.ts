import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Querying divisions ---');
  const divisions = await prisma.division.findMany({
    include: { media: true },
  });
  console.log(JSON.stringify(divisions, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
