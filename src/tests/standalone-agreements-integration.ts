import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role, DocumentType } from '@prisma/client';
import fs from 'fs';
import {
  createTemplate,
  assignAgreement,
  uploadDocument,
  getDocuments,
  deleteDocument,
  downloadDocument,
  signAgreement as signStandaloneAgreement,
  getSignature as getStandaloneSignature,
  generatePdf as generateStandalonePdf,
  downloadPdf as downloadStandalonePdf,
} from '../modules/standalone-agreements/standalone-agreements.controller';

// Silence console logs during tests
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
function mockRequestResponse(body = {}, params = {}, query = {}, file?: any, user?: any) {
  const req = {
    body,
    params,
    query,
    file,
    headers: {
      'user-agent': 'TestRunner/1.0',
    },
    ip: '127.0.0.1',
    requestId: 'test-corr-id',
    user
  } as unknown as Request;

  let statusCode = 200;
  let responseData: any = null;
  let nextError: any = null;
  let fileSentPath: string | null = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    sendFile(filePath: string) {
      fileSentPath = filePath;
      return this;
    },
    setHeader(_name: string, _value: string) {
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
      return { statusCode, responseData, nextError, fileSentPath };
    }
  };
}

export async function runTests() {
  console.log('\n🧪 Starting APCO Standalone Agreements Integration Tests...\n');
  let passed = 0;
  let failed = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    silenceLogs();
    try {
      await fn();
      restoreLogs();
      console.log(`   ✅ [PASSED] ${name}`);
      passed++;
    } catch (err: any) {
      restoreLogs();
      console.log(`   ❌ [FAILED] ${name}`);
      console.error(`      Reason: ${err.message || err}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(0, 3).join('\n'));
      }
      failed++;
    }
  }

  // Save original model interfaces
  const mockPrisma = prisma as any;
  const originalTemplate = mockPrisma.standaloneAgreementTemplate;
  const originalAgreement = mockPrisma.standaloneAgreement;
  const originalDocument = mockPrisma.standaloneAgreementDocument;
  const originalClient = mockPrisma.client;
  const originalAuditLog = mockPrisma.auditLog;
  const originalProject = mockPrisma.project;
  const originalQuotation = mockPrisma.quotation;
  const originalInvoice = mockPrisma.invoice;
  const originalCompanyProfile = mockPrisma.companyProfile;
  const originalPayment = mockPrisma.payment;
  const originalTask = mockPrisma.task;
  const originalEvent = mockPrisma.event;
  const originalTransaction = mockPrisma.$transaction;

  // Mock models
  mockPrisma.auditLog = { create: async () => ({}) };
  mockPrisma.$transaction = async (callback: (tx: any) => Promise<any>) => {
    return callback(mockPrisma);
  };
  mockPrisma.project = { findFirst: async () => null };
  mockPrisma.quotation = { findFirst: async () => null };
  mockPrisma.invoice = { findFirst: async () => null };
  mockPrisma.companyProfile = { findFirst: async () => null };
  mockPrisma.payment = { findMany: async () => [] };
  mockPrisma.task = { findFirst: async () => null };
  mockPrisma.event = { findFirst: async () => null };

  const testAdminUser = { id: 'admin-1', email: 'admin@apco.com', role: Role.SystemAdmin };
  const testClientUser = { id: 'client-user-1', email: 'client@apco.com', role: Role.Client };
  const testUnrelatedClient = { id: 'client-user-2', email: 'other@apco.com', role: Role.Client };
  const testPhotographer = { id: 'photo-1', email: 'photo@apco.com', role: Role.Photographer };

  const mockClientRecord = { id: 'client-rec-1', name: 'Joel', email: 'client@apco.com', deletedAt: null };
  const mockAgreementRecord = { id: 'agr-1', clientId: 'client-rec-1', templateId: 'tpl-1', title: 'NDA', status: 'PENDING', createdAt: new Date() };
  const mockDocumentRecord = { id: 'doc-1', agreementId: 'agr-1', documentType: DocumentType.AADHAAR, fileUrl: '/api/standalone-agreements/documents/download/file-123.pdf' };

  try {
    // 1. Template CRUD Tests
    await testCase('Templates: SystemAdmin/Manager can create template', async () => {
      mockPrisma.standaloneAgreementTemplate = {
        create: async (args: any) => ({ id: 'sat-1', ...args.data }),
      };
      const { req, res, next, results } = mockRequestResponse({ name: 'Template Name', version: '1.0', content: 'Test Content' }, {}, {}, null, testAdminUser);
      await createTemplate(req, res, next);
      const { statusCode, responseData } = results();
      if (statusCode !== 201 || responseData.id !== 'sat-1') {
        throw new Error('Failed to create standalone template.');
      }
    });

    await testCase('Templates: Photographer cannot create template (403)', async () => {
      const { req, res, next, results } = mockRequestResponse({ name: 'Template Name', version: '1.0', content: 'Test Content' }, {}, {}, null, testPhotographer);
      await createTemplate(req, res, next);
      const { nextError } = results();
      if (!nextError || nextError.statusCode !== 403) {
        throw new Error('Expected 403 for non-admin/manager.');
      }
    });

    // 2. Assignment Tests
    await testCase('Assignment: Prevent duplicate PENDING agreement', async () => {
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };
      mockPrisma.standaloneAgreement = {
        findFirst: async () => mockAgreementRecord, // Already has pending
      };
      const { req, res, next, results } = mockRequestResponse({ clientId: 'client-rec-1', templateId: 'tpl-1' }, {}, {}, null, testAdminUser);
      await assignAgreement(req, res, next);
      const { nextError } = results();
      if (!nextError || nextError.statusCode !== 400 || !nextError.message.includes('PENDING')) {
        throw new Error('Expected 400 with duplicate pending message.');
      }
    });

    // 3. Document Upload Tests
    await testCase('Upload: Unrelated client is blocked from uploading documents (403)', async () => {
      mockPrisma.standaloneAgreement = {
        findUnique: async () => mockAgreementRecord,
      };
      mockPrisma.client = {
        findFirst: async (args: any) => {
          // Other client user
          if (args.where.email === 'other@apco.com') return { id: 'client-rec-2', email: 'other@apco.com' };
          return null;
        }
      };

      const dummyFile = {
        path: 'uploads/standalone-agreements/dummy.pdf',
        filename: 'dummy.pdf',
        originalname: 'dummy.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };

      // Mock fs.unlinkSync
      const originalUnlink = fs.unlinkSync;
      let unlinked = false;
      fs.unlinkSync = () => { unlinked = true; };

      try {
        const { req, res, next, results } = mockRequestResponse(
          { documentType: DocumentType.AADHAAR },
          { agreementId: 'agr-1' },
          {},
          dummyFile,
          testUnrelatedClient
        );
        await uploadDocument(req, res, next);
        const { nextError } = results();
        if (!nextError || nextError.statusCode !== 403 || !unlinked) {
          throw new Error('Expected 403 access denied and physical file cleanup.');
        }
      } finally {
        fs.unlinkSync = originalUnlink;
      }
    });

    await testCase('Upload: Authorized client can upload and save document', async () => {
      mockPrisma.standaloneAgreement = {
        findUnique: async () => mockAgreementRecord,
      };
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };
      mockPrisma.standaloneAgreementDocument = {
        create: async (args: any) => ({ id: 'sad-1', ...args.data }),
      };

      const dummyFile = {
        path: 'uploads/standalone-agreements/file-123.pdf',
        filename: 'file-123.pdf',
        originalname: 'file-123.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };

      const { req, res, next, results } = mockRequestResponse(
        { documentType: DocumentType.AADHAAR },
        { agreementId: 'agr-1' },
        {},
        dummyFile,
        testClientUser
      );
      await uploadDocument(req, res, next);
      const { statusCode, responseData } = results();
      if (statusCode !== 201 || responseData.agreementId !== 'agr-1' || responseData.documentType !== DocumentType.AADHAAR) {
        throw new Error('Failed to upload document.');
      }
    });

    // 4. Get Documents Tests
    await testCase('Get Documents: Client owner can get documents list', async () => {
      mockPrisma.standaloneAgreement = {
        findUnique: async () => mockAgreementRecord,
      };
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };
      mockPrisma.standaloneAgreementDocument = {
        findMany: async () => [mockDocumentRecord],
      };

      const { req, res, next, results } = mockRequestResponse({}, { agreementId: 'agr-1' }, {}, null, testClientUser);
      await getDocuments(req, res, next);
      const { statusCode, responseData } = results();
      if (statusCode !== 200 || responseData.length !== 1 || responseData[0].id !== 'doc-1') {
        throw new Error('Failed to retrieve agreement documents.');
      }
    });

    // 5. Delete Document Tests
    await testCase('Delete Document: Cleans up physical file on disk', async () => {
      mockPrisma.standaloneAgreementDocument = {
        findUnique: async () => ({
          ...mockDocumentRecord,
          agreement: mockAgreementRecord,
        }),
        delete: async () => mockDocumentRecord,
      };
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };

      const originalExists = fs.existsSync;
      const originalUnlink = fs.unlinkSync;
      let unlinkedPath = '';
      fs.existsSync = () => true;
      fs.unlinkSync = (p) => { unlinkedPath = String(p); };

      try {
        const { req, res, next, results } = mockRequestResponse({}, { documentId: 'doc-1' }, {}, null, testClientUser);
        await deleteDocument(req, res, next);
        const { statusCode } = results();
        if (statusCode !== 200 || !unlinkedPath || !unlinkedPath.includes('file-123.pdf')) {
          throw new Error('Failed to delete document or unlink physical file.');
        }
      } finally {
        fs.existsSync = originalExists;
        fs.unlinkSync = originalUnlink;
      }
    });

    // 6. Download Document Tests
    await testCase('Download Document: Client owner can download file', async () => {
      mockPrisma.standaloneAgreementDocument = {
        findUnique: async () => ({
          ...mockDocumentRecord,
          agreement: mockAgreementRecord,
        }),
      };
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };

      const originalExists = fs.existsSync;
      fs.existsSync = () => true;

      try {
        const { req, res, next, results } = mockRequestResponse({}, { documentId: 'doc-1' }, {}, null, testClientUser);
        await downloadDocument(req, res, next);
        const { fileSentPath, nextError } = results();
        if (nextError) throw nextError;
        if (!fileSentPath || !fileSentPath.includes('file-123.pdf')) {
          throw new Error('Expected file to be sent to client.');
        }
      } finally {
        fs.existsSync = originalExists;
      }
    });

    // 7. Signature Tests
    await testCase('Signature: Block signing if no identity document exists', async () => {
      mockPrisma.standaloneAgreement = {
        findUnique: async () => ({
          ...mockAgreementRecord,
          documents: [], // No documents
          signatures: [],
        }),
      };
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };

      const { req, res, next, results } = mockRequestResponse(
        { signerName: 'Joel', signatureImageUrl: 'data:image/png;base64,123' },
        { agreementId: 'agr-1' },
        {},
        null,
        testClientUser
      );
      await signStandaloneAgreement(req, res, next);
      const { nextError } = results();
      if (!nextError || nextError.statusCode !== 400 || !nextError.message.includes('identity verification document')) {
        throw new Error('Expected 400 validation error since no identity proof is uploaded.');
      }
    });

    await testCase('Signature: Successfully sign agreement (transition PENDING -> SIGNED)', async () => {
      let agreementUpdated = false;
      let signatureCreated = false;

      mockPrisma.standaloneAgreement = {
        findUnique: async () => ({
          ...mockAgreementRecord,
          documents: [mockDocumentRecord],
          signatures: [],
        }),
        update: async (args: any) => {
          if (args.where.id === 'agr-1' && args.data.status === 'SIGNED') {
            agreementUpdated = true;
          }
          return { id: 'agr-1', status: 'SIGNED' };
        },
      };
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };
      mockPrisma.standaloneAgreementSignature = {
        create: async (args: any) => {
          signatureCreated = true;
          return { id: 'sig-1', ...args.data };
        },
        findFirst: async () => ({ id: 'sig-1', signerName: 'Joel' }),
      };

      const { req, res, next, results } = mockRequestResponse(
        { signerName: 'Joel', signatureImageUrl: 'data:image/png;base64,123' },
        { agreementId: 'agr-1' },
        {},
        null,
        testClientUser
      );
      await signStandaloneAgreement(req, res, next);
      const { statusCode, responseData } = results();

      if (statusCode !== 201 || !signatureCreated || !agreementUpdated || responseData.id !== 'sig-1') {
        throw new Error('Failed to sign agreement.');
      }

      // Check signature retrieval
      const { req: getReq, res: getRes, next: getNext, results: getResults } = mockRequestResponse(
        {},
        { agreementId: 'agr-1' },
        {},
        null,
        testClientUser
      );
      await getStandaloneSignature(getReq, getRes, getNext);
      const { responseData: signatureData } = getResults();
      if (!signatureData || signatureData.signerName !== 'Joel') {
        throw new Error('Failed to retrieve signature details.');
      }
    });

    await testCase('Signature PDF: Unrelated client is blocked from generating/retrieving PDF (403)', async () => {
      mockPrisma.standaloneAgreement = {
        findUnique: async () => ({
          ...mockAgreementRecord,
          status: 'SIGNED',
        }),
      };
      mockPrisma.client = {
        findFirst: async (args: any) => {
          if (args.where.email === 'other@apco.com') return { id: 'client-rec-2', email: 'other@apco.com' };
          return null;
        }
      };

      const { req, res, next, results } = mockRequestResponse(
        {},
        { agreementId: 'agr-1' },
        {},
        null,
        testUnrelatedClient
      );
      await generateStandalonePdf(req, res, next);
      const { nextError } = results();
      if (!nextError || nextError.statusCode !== 403) {
        throw new Error('Expected 403 access denied error.');
      }

      const { req: downloadReq, res: downloadRes, next: downloadNext, results: downloadResults } = mockRequestResponse(
        {},
        { agreementId: 'agr-1' },
        {},
        null,
        testUnrelatedClient
      );
      await downloadStandalonePdf(downloadReq, downloadRes, downloadNext);
      const { nextError: downloadError } = downloadResults();
      if (!downloadError || downloadError.statusCode !== 403) {
        throw new Error('Expected 403 access denied error for download.');
      }
    });

    await testCase('Signature PDF: Block generation if agreement is not in SIGNED status (400)', async () => {
      mockPrisma.standaloneAgreement = {
        findUnique: async () => ({
          ...mockAgreementRecord,
          status: 'PENDING',
        }),
      };
      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };

      const { req, res, next, results } = mockRequestResponse(
        {},
        { agreementId: 'agr-1' },
        {},
        null,
        testClientUser
      );
      await generateStandalonePdf(req, res, next);
      const { nextError } = results();
      if (!nextError || nextError.statusCode !== 400 || !nextError.message.includes('signed')) {
        throw new Error('Expected 400 validation error for non-signed agreement.');
      }
    });

    await testCase('Signature PDF: Successfully generate and download signed agreement PDF', async () => {
      let databaseUpdated = false;
      let mockPdfPath = 'uploads/standalone-agreements/pdfs/signed-agreement-agr-1.pdf';

      mockPrisma.standaloneAgreement = {
        findUnique: async () => ({
          ...mockAgreementRecord,
          status: 'SIGNED',
          generatedContent: 'This is the generated agreement content.',
          assignedAt: new Date(),
          client: mockClientRecord,
          template: { id: 'tpl-1', name: 'Standard Terms', version: '1.0' },
          signatures: [{ signerName: 'Joel', signatureImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', signedAt: new Date() }],
          documents: [mockDocumentRecord],
          linkedQuoteId: 'quo-1',
          pdfFilePath: mockPdfPath,
          pdfGeneratedAt: new Date(),
        }),
        update: async (args: any) => {
          if (args.where.id === 'agr-1' && args.data.pdfFilePath) {
            databaseUpdated = true;
          }
          return { id: 'agr-1', status: 'SIGNED' };
        },
      };

      mockPrisma.client = {
        findFirst: async () => mockClientRecord,
      };

      const originalWriteFileSync = fs.writeFileSync;
      const originalExistsSync = fs.existsSync;
      let writtenBytes: Buffer | string | null = null;
      
      fs.writeFileSync = (filePath: any, data: any) => {
        if (String(filePath).includes('signed-agreement-agr-1.pdf')) {
          writtenBytes = data;
        }
      };
      fs.existsSync = (filePath: any) => {
        if (String(filePath).includes('signed-agreement-agr-1.pdf')) {
          return true;
        }
        return originalExistsSync(filePath);
      };

      try {
        const { req, res, next, results } = mockRequestResponse(
          {},
          { agreementId: 'agr-1' },
          {},
          null,
          testClientUser
        );
        await generateStandalonePdf(req, res, next);
        const { statusCode, nextError } = results();

        if (statusCode !== 200 || !databaseUpdated || !writtenBytes) {
          if (nextError) {
            restoreLogs();
            console.error('ST_GEN_ERR:', nextError);
          }
          throw new Error('Failed to generate signed PDF.');
        }

        const { req: getReq, res: getRes, next: getNext, results: getResults } = mockRequestResponse(
          {},
          { agreementId: 'agr-1' },
          {},
          null,
          testClientUser
        );
        await downloadStandalonePdf(getReq, getRes, getNext);
        const { fileSentPath, statusCode: getStatus } = getResults();

        if (getStatus !== 200 || !fileSentPath || !fileSentPath.includes('signed-agreement-agr-1.pdf')) {
          throw new Error('Failed to download/serve signed PDF.');
        }
      } finally {
        fs.writeFileSync = originalWriteFileSync;
        fs.existsSync = originalExistsSync;
      }
    });

  } finally {
    // Restore prisma models
    mockPrisma.standaloneAgreementTemplate = originalTemplate;
    mockPrisma.standaloneAgreement = originalAgreement;
    mockPrisma.standaloneAgreementDocument = originalDocument;
    mockPrisma.client = originalClient;
    mockPrisma.auditLog = originalAuditLog;
    mockPrisma.project = originalProject;
    mockPrisma.quotation = originalQuotation;
    mockPrisma.invoice = originalInvoice;
    mockPrisma.companyProfile = originalCompanyProfile;
    mockPrisma.payment = originalPayment;
    mockPrisma.task = originalTask;
    mockPrisma.event = originalEvent;
    mockPrisma.$transaction = originalTransaction;
  }

  if (failed > 0) {
    console.log(`\n❌ STANDALONE AGREEMENTS TESTS COMPLETED WITH FAILURES: Passed: ${passed}, Failed: ${failed}`);
    throw new Error('Some standalone agreement integration tests failed.');
  } else {
    console.log(`\n🎉 ALL ${passed} STANDALONE AGREEMENTS INTEGRATION TESTS PASSED SUCCESSFULLY!`);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  });
}
