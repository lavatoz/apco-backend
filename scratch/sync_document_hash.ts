import { prisma } from '../src/config/database';
import { calculateDocumentHash } from '../src/services/pdf-security.service';
import fs from 'fs';
import path from 'path';

async function syncHash() {
  const documentId = 'AK-DOC-2026-000009';
  const filePath = path.resolve(process.cwd(), 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0004_rohit.pdf');

  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const newHash = calculateDocumentHash(fileBuffer);
    console.log(`Computed current file hash on disk: ${newHash}`);

    await prisma.documentRegistry.update({
      where: { documentId },
      data: { sha256Hash: newHash }
    });

    await prisma.file.updateMany({
      where: { key: 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0004_rohit.pdf' },
      data: { hash: newHash }
    });

    console.log(`✅ Synced sha256Hash for ${documentId} and File record to ${newHash}`);
  } else {
    console.error(`File not found at ${filePath}`);
  }
}

syncHash().catch(console.error).finally(() => prisma.$disconnect());
