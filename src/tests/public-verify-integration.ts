import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { verifyPublicDocumentController, verifyDocumentByIdController } from '../modules/public/public.controller';
import { calculateDocumentHash } from '../services/pdf-security.service';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Silence console logs during tests to keep output clean
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function silenceLogs() {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

function restoreLogs() {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
}

// Helper to construct express request/response mock pairs
function mockRequestResponse(params = {}) {
  const req = {
    params,
    headers: {
      'user-agent': 'TestRunner/1.0',
    },
    ip: '127.0.0.1',
    requestId: 'test-verify-id',
  } as unknown as Request;

  let statusCode = 200;
  let responseData: any = null;
  let nextError: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    }
  } as unknown as Response;

  const next = (err?: any) => {
    nextError = err;
  };

  return {
    req,
    res,
    next,
    results() {
      return { statusCode, responseData, nextError };
    }
  };
}

export async function runTests() {
  console.log('\n🧪 Starting APCO Public Document Verification API Integration Tests...\n');
  let passedCount = 0;
  let failedCount = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    silenceLogs();
    try {
      await fn();
      restoreLogs();
      console.log(`   ✅ [PASSED] ${name}`);
      passedCount++;
    } catch (err: any) {
      restoreLogs();
      console.log(`   ❌ [FAILED] ${name}`);
      console.error(`      Reason: ${err.message || err}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(0, 3).join('\n'));
      }
      failedCount++;
    }
  }

  // Track created entity IDs for database cleanup
  let createdFileId: string | null = null;
  let createdClientId: string | null = null;
  let createdProjectId: string | null = null;
  let createdQuotationId: string | null = null;
  let mockFilePath: string | null = null;

  // Test 1: Zod validation error for malformed UUID format
  await testCase('Returns 400 Bad Request for malformed UUID format', async () => {
    const { req, res, next, results } = mockRequestResponse({ verificationId: 'invalid-uuid-string' });
    await verifyPublicDocumentController(req, res, next);
    const { nextError } = results();
    if (!nextError || nextError.statusCode !== 400 || !nextError.message.includes('verification ID')) {
      throw new Error(`Expected Zod validation error 400, got: ${nextError ? nextError.message : 'success'}`);
    }
  });

  // Test 2: Returns 404 NOT_FOUND for non-existent verification UUID
  await testCase('Returns 404 NOT_FOUND for non-existent verification UUID', async () => {
    const nonExistentId = crypto.randomUUID();
    const { req, res, next, results } = mockRequestResponse({ verificationId: nonExistentId });
    await verifyPublicDocumentController(req, res, next);
    const { statusCode, responseData } = results();
    if (statusCode !== 404 || responseData?.verificationStatus !== 'NOT_FOUND') {
      throw new Error(`Expected 404 NOT_FOUND, got: Status ${statusCode}, Body: ${JSON.stringify(responseData)}`);
    }
  });

  // Test 3: Returns 200 VERIFIED for matching document
  await testCase('Returns 200 VERIFIED for matching document and correct hash integrity', async () => {
    createdFileId = crypto.randomUUID();
    mockFilePath = `uploads/quotations/pdfs/Quotation_test_${createdFileId}.pdf`;
    const fileContent = Buffer.from('PDF_TEST_CONTENT_OK');
    const fileHash = calculateDocumentHash(fileContent);

    // Save physical file
    const absPath = path.resolve(process.cwd(), mockFilePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, fileContent);

    // Create record in DB
    await prisma.file.create({
      data: {
        id: createdFileId,
        key: mockFilePath,
        originalName: `Quotation_test_${createdFileId}.pdf`,
        mimeType: 'application/pdf',
        size: fileContent.length,
        hash: fileHash,
        category: 'Quotations',
      }
    });

    const { req, res, next, results } = mockRequestResponse({ verificationId: createdFileId });
    await verifyPublicDocumentController(req, res, next);
    const { statusCode, responseData } = results();
    
    if (statusCode !== 200) {
      throw new Error(`Expected status 200, got: ${statusCode}`);
    }
    if (responseData.verificationStatus !== 'VERIFIED') {
      throw new Error(`Expected verificationStatus 'VERIFIED', got: '${responseData.verificationStatus}'`);
    }
    if (responseData.sha256VerificationResult !== fileHash) {
      throw new Error(`Expected hash result '${fileHash}', got: '${responseData.sha256VerificationResult}'`);
    }
  });

  // Test 4: Returns 200 TAMPERED when the physical file does not match DB hash
  await testCase('Returns 200 TAMPERED when calculated file hash deviates from DB registry', async () => {
    if (!createdFileId || !mockFilePath) throw new Error('Setup failed in previous step');

    // Overwrite file with different content to alter hash
    const absPath = path.resolve(process.cwd(), mockFilePath);
    fs.writeFileSync(absPath, Buffer.from('TAMPERED_PDF_TEST_CONTENT'));

    const { req, res, next, results } = mockRequestResponse({ verificationId: createdFileId });
    await verifyPublicDocumentController(req, res, next);
    const { statusCode, responseData } = results();

    if (statusCode !== 200) {
      throw new Error(`Expected status 200, got: ${statusCode}`);
    }
    if (responseData.verificationStatus !== 'TAMPERED') {
      throw new Error(`Expected verificationStatus 'TAMPERED', got: '${responseData.verificationStatus}'`);
    }
  });

  // Test 5: Returns 200 EXPIRED when validUntil of quotation is in the past
  await testCase('Returns 200 EXPIRED for expired quotations', async () => {
    if (!createdFileId || !mockFilePath) throw new Error('Setup failed in previous step');

    const codeSuffix = createdFileId.substring(0, 8);
    // Create client
    const client = await prisma.client.create({
      data: {
        clientCode: `CL-${codeSuffix}`,
        name: 'Verification Client',
        email: `verify-client-${codeSuffix}@apco.local`,
      }
    });
    createdClientId = client.id;

    // Create project
    const project = await prisma.project.create({
      data: {
        projectCode: `PR-${codeSuffix}`,
        name: 'Verification Event',
        clientId: client.id,
      }
    });
    createdProjectId = project.id;

    // Create expired quotation
    const quotation = await prisma.quotation.create({
      data: {
        quotationCode: `QUO-${codeSuffix}`,
        quotationNumber: `QT-${codeSuffix}`,
        amount: 20000,
        projectId: project.id,
        clientId: client.id,
        validUntil: new Date(Date.now() - 60000), // 1 minute ago (Expired)
      }
    });
    createdQuotationId = quotation.id;

    // Restore correct file hash so we don't trigger TAMPERED
    const fileContent = Buffer.from('PDF_TEST_CONTENT_OK');
    const absPath = path.resolve(process.cwd(), mockFilePath);
    fs.writeFileSync(absPath, fileContent);

    // Link file to project and mock name matching the quotation number
    await prisma.file.update({
      where: { id: createdFileId },
      data: {
        projectId: project.id,
        originalName: `Quotation_QT-${codeSuffix}.pdf`
      }
    });

    const { req, res, next, results } = mockRequestResponse({ verificationId: createdFileId });
    await verifyPublicDocumentController(req, res, next);
    const { statusCode, responseData } = results();

    if (statusCode !== 200) {
      throw new Error(`Expected status 200, got: ${statusCode}`);
    }
    if (responseData.verificationStatus !== 'EXPIRED') {
      throw new Error(`Expected verificationStatus 'EXPIRED', got: '${responseData.verificationStatus}'`);
    }
  });

  // Test 6: Returns 200 REVOKED for soft deleted or explicitly revoked documents
  await testCase('Returns 200 REVOKED when file is soft-deleted or marked as revoked', async () => {
    if (!createdFileId) throw new Error('Setup failed in previous step');

    // Soft delete file
    await prisma.file.update({
      where: { id: createdFileId },
      data: { deletedAt: new Date() }
    });

    const { req, res, next, results } = mockRequestResponse({ verificationId: createdFileId });
    await verifyPublicDocumentController(req, res, next);
    const { statusCode, responseData } = results();

    if (statusCode !== 200) {
      throw new Error(`Expected status 200, got: ${statusCode}`);
    }
    if (responseData.verificationStatus !== 'REVOKED') {
      throw new Error(`Expected verificationStatus 'REVOKED', got: '${responseData.verificationStatus}'`);
    }
  });

  // Test: Verify by Document ID
  await testCase('Verifies document successfully by Document ID', async () => {
    const documentId = 'APCO-DOC-2026-TEST01';
    await prisma.documentRegistry.upsert({
      where: { documentId },
      update: {
        verificationUrl: 'http://localhost:3000/verify/' + documentId,
        documentNumber: 'QT-2026-TEST',
        documentType: 'QUOTATION',
        clientId: createdClientId || 'test-client',
        projectId: createdProjectId,
        sha256Hash: 'dummy-hash',
        status: 'Active',
      },
      create: {
        documentId,
        verificationUrl: 'http://localhost:3000/verify/' + documentId,
        documentNumber: 'QT-2026-TEST',
        documentType: 'QUOTATION',
        clientId: createdClientId || 'test-client',
        projectId: createdProjectId,
        sha256Hash: 'dummy-hash',
        status: 'Active',
      }
    });

    try {
      const { req, res, next, results } = mockRequestResponse({ documentId });
      await verifyDocumentByIdController(req, res, next);
      const { statusCode, responseData } = results();

      if (statusCode !== 200) {
        throw new Error(`Expected status 200, got: ${statusCode}`);
      }
      if (responseData.verificationStatus !== 'VERIFIED') {
        throw new Error(`Expected verificationStatus 'VERIFIED', got: '${responseData.verificationStatus}'`);
      }
      if (responseData.documentNumber !== 'QT-2026-TEST') {
        throw new Error(`Expected documentNumber 'QT-2026-TEST', got: '${responseData.documentNumber}'`);
      }
    } finally {
      await prisma.documentRegistry.delete({ where: { documentId } });
    }
  });

  // Database and Disk Cleanup
  try {
    if (mockFilePath) {
      const absPath = path.resolve(process.cwd(), mockFilePath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    }
    if (createdQuotationId) {
      await prisma.quotation.delete({ where: { id: createdQuotationId } });
    }
    if (createdProjectId) {
      await prisma.project.delete({ where: { id: createdProjectId } });
    }
    if (createdClientId) {
      await prisma.client.delete({ where: { id: createdClientId } });
    }
    if (createdFileId) {
      await prisma.file.delete({ where: { id: createdFileId } });
    }
  } catch (cleanErr) {
    console.error('⚠️ Cleanup failed:', cleanErr);
  }

  console.log('\n📊 Public Verification API Integration Results:');
  console.log(`   Passed: ${passedCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log('------------------------------');

  if (failedCount > 0) {
    throw new Error('Some Public Verification integration tests failed');
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  });
}
