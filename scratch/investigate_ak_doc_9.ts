import { prisma } from '../src/config/database';
import { calculateDocumentHash } from '../src/services/pdf-security.service';
import fs from 'fs';
import path from 'path';

async function investigate() {
  const documentId = 'AK-DOC-2026-000009';
  console.log(`🔍 Task 1 & 2: Investigating Document ID: ${documentId}\n`);

  // 1. Retrieve DocumentRegistry record
  const docRegistry = await prisma.documentRegistry.findUnique({
    where: { documentId }
  });

  console.log('--- 1. DocumentRegistry Record ---');
  console.log(JSON.stringify(docRegistry, null, 2));

  // 2. Retrieve File table record(s) matching documentNumber or key or sha256Hash
  const filesByHash = docRegistry?.sha256Hash
    ? await prisma.file.findMany({ where: { hash: docRegistry.sha256Hash } })
    : [];

  const filesByKey = await prisma.file.findMany({
    where: { key: { contains: 'AK-QUO-2026-0004' } }
  });

  console.log('\n--- 2. File Table Records (by Hash) ---');
  console.log(JSON.stringify(filesByHash, null, 2));

  console.log('\n--- 2. File Table Records (by Key) ---');
  console.log(JSON.stringify(filesByKey, null, 2));

  // 3. Inspect physical file on disk
  const possiblePaths = [
    path.resolve(process.cwd(), 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0004_rohit.pdf'),
    ...(filesByKey.map(f => path.resolve(process.cwd(), f.key))),
  ];

  const uniquePaths = Array.from(new Set(possiblePaths));

  console.log('\n--- 3. Disk File Hash Calculation ---');
  for (const p of uniquePaths) {
    if (fs.existsSync(p)) {
      const stats = fs.statSync(p);
      const buffer = fs.readFileSync(p);
      const diskHash = calculateDocumentHash(buffer);

      console.log(`Path: ${p}`);
      console.log(`  File Size: ${stats.size} bytes`);
      console.log(`  Last Modified: ${stats.mtime.toISOString()}`);
      console.log(`  Calculated SHA-256 Hash: ${diskHash}`);

      console.log('\n--- 4. Hash Comparison Table ---');
      console.table([
        { Field: 'DocumentRegistry.sha256Hash', Value: docRegistry?.sha256Hash },
        { Field: 'File.hash (DB)', Value: filesByKey[0]?.hash || filesByHash[0]?.hash },
        { Field: 'Current Disk SHA-256', Value: diskHash },
        { Field: 'DocRegistry == File.hash', Value: docRegistry?.sha256Hash === (filesByKey[0]?.hash || filesByHash[0]?.hash) },
        { Field: 'DocRegistry == Disk SHA-256', Value: docRegistry?.sha256Hash === diskHash },
        { Field: 'File.hash == Disk SHA-256', Value: (filesByKey[0]?.hash || filesByHash[0]?.hash) === diskHash },
      ]);
    } else {
      console.log(`Path: ${p} (File does NOT exist)`);
    }
  }

  // 4. Audit Trail & Timeline Logs for this document/quotation
  console.log('\n--- 5. Audit Log History ---');
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { details: { path: ['documentId'], equals: documentId } },
        { details: { path: ['documentNumber'], equals: 'AK-QUO-2026-0004' } },
        { details: { path: ['quotationNumber'], equals: 'AK-QUO-2026-0004' } },
      ]
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(JSON.stringify(auditLogs, null, 2));
}

investigate().catch(console.error).finally(() => prisma.$disconnect());
