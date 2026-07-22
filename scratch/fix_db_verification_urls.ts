import { prisma } from '../src/config/database';
import { DocumentRegistryService } from '../src/services/document-registry.service';

async function main() {
  console.log('🔧 Updating legacy DocumentRegistry verificationUrls in DB...');
  const records = await prisma.documentRegistry.findMany();
  let updatedCount = 0;

  for (const record of records) {
    if (
      !record.verificationUrl ||
      record.verificationUrl.includes('localhost') ||
      record.verificationUrl.includes('verify.artisains.com') ||
      record.verificationUrl.trim() === ''
    ) {
      const correctUrl = DocumentRegistryService.getVerificationUrl(record.documentId);
      await prisma.documentRegistry.update({
        where: { documentId: record.documentId },
        data: { verificationUrl: correctUrl }
      });
      console.log(`Updated ${record.documentId} -> ${correctUrl}`);
      updatedCount++;
    }
  }

  console.log(`✅ Fixed ${updatedCount} records in DocumentRegistry table.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
