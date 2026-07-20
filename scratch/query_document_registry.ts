import { prisma } from '../src/config/database';

async function main() {
  console.log('🔍 Querying DocumentRegistry for AK-DOC-2026-000009...');

  const targetDoc = await prisma.documentRegistry.findUnique({
    where: { documentId: 'AK-DOC-2026-000009' }
  });

  console.log('Target Document Result:', targetDoc);

  console.log('\n📊 Listing all records in DocumentRegistry (limit 20):');
  const allDocs = await prisma.documentRegistry.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Found ${allDocs.length} document(s) in registry:`);
  console.log(JSON.stringify(allDocs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
