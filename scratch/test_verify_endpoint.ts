import { prisma } from '../src/config/database';
import { calculateDocumentHash } from '../src/services/pdf-security.service';
import fs from 'fs';
import path from 'path';

async function testHashMismatch() {
  const documentId = 'AK-DOC-2026-000009';
  const docRegistry = await prisma.documentRegistry.findUnique({
    where: { documentId }
  });

  console.log('DocRegistry sha256Hash:', docRegistry?.sha256Hash);

  const file = await prisma.file.findFirst({
    where: { hash: docRegistry?.sha256Hash }
  });

  console.log('File record found:', file);

  if (file) {
    const candidatePaths = [
      path.resolve(process.cwd(), file.key),
      path.resolve(process.cwd(), 'uploads/quotations/pdfs', file.originalName),
      path.resolve(process.cwd(), 'uploads/agreements/pdfs', file.originalName),
    ];

    for (const p of candidatePaths) {
      console.log(`Checking path ${p}: exists=${fs.existsSync(p)}`);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const fileBuffer = fs.readFileSync(p);
        const currentHash = calculateDocumentHash(fileBuffer);
        console.log(`Disk File Path: ${p}`);
        console.log(`Disk File Hash: ${currentHash}`);
        console.log(`Match with docRegistry.sha256Hash? ${currentHash === docRegistry?.sha256Hash}`);
      }
    }
  }
}

testHashMismatch().catch(console.error).finally(() => prisma.$disconnect());
