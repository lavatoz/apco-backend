import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.globalSetting.findMany();
  console.log('--- GLOBAL SETTINGS ---');
  for (const s of settings) {
    console.log(`${s.key}: "${s.value}"`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
