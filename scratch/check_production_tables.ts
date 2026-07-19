import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching DocumentRegistry entries in production...');
  const registries = await prisma.documentRegistry.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log('Latest DocumentRegistry entries:', registries);

  console.log('Fetching DocumentCounter entries in production...');
  const counters = await prisma.documentCounter.findMany();
  console.log('DocumentCounter entries:', counters);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
