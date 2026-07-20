import { prisma } from '../src/config/database';
import { calculateDocumentHash } from '../src/services/pdf-security.service';
import fs from 'fs';
import path from 'path';

async function printTable() {
  const documentId = 'AK-DOC-2026-000009';
  const docRegistry = await prisma.documentRegistry.findUnique({
    where: { documentId }
  });

  const fileByKey = await prisma.file.findFirst({
    where: { key: { contains: 'AK-QUO-2026-0004' } }
  });

  const diskPath = path.resolve(process.cwd(), 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0004_rohit.pdf');
  const buffer = fs.readFileSync(diskPath);
  const diskHash = calculateDocumentHash(buffer);

  console.log('=== EXACT HASH VALUES FOR AK-DOC-2026-000009 ===');
  console.log(`1. DocumentRegistry.sha256Hash: ${docRegistry?.sha256Hash}`);
  console.log(`2. File.hash (Database):         ${fileByKey?.hash}`);
  console.log(`3. Current Disk File SHA-256:    ${diskHash}`);
  console.log(`4. File Path:                    ${diskPath}`);
  console.log(`5. File Size:                    ${fs.statSync(diskPath).size} bytes`);
  console.log(`6. File Last Modified:           ${fs.statSync(diskPath).mtime.toISOString()}`);
}

printTable().catch(console.error).finally(() => prisma.$disconnect());
