import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role } from '@prisma/client';
import { generateProjectAgreement } from '../modules/agreements/agreements.controller';

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

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
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
      return { statusCode, responseData, nextError };
    }
  };
}

export async function runTests() {
  console.log('\n🧪 Starting APCO Agreement Generation Integration Tests...\n');
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
  const originalFile = mockPrisma.file;
  const originalProject = mockPrisma.project;
  const originalQuotation = mockPrisma.quotation;
  const originalInvoice = mockPrisma.invoice;
  const originalPayment = mockPrisma.payment;
  const originalTask = mockPrisma.task;
  const originalEvent = mockPrisma.event;
  const originalAgreement = mockPrisma.agreement;
  const originalAuditLog = mockPrisma.auditLog;
  const originalWorkflowEvent = mockPrisma.workflowEvent;
  const originalCompanyProfile = mockPrisma.companyProfile;

  // Mock companyProfile model
  mockPrisma.companyProfile = {
    findFirst: async () => ({
      id: 'comp-1',
      companyName: 'Artisans Production Company',
      tagline: 'Artisans Tagline',
      primaryColor: '#3B82F6',
      logo: 'data:image/png;base64,mocklogo',
      phone: '1234567890',
      email: 'contact@artisans.com',
      address: '123 Street'
    }),
  };

  // Mock GDrive service methods
  const googleDriveService = require('../services/google-drive.service');
  const originalUpload = googleDriveService.uploadFile;
  const originalFolderStructure = googleDriveService.getOrCreateProjectFolderStructure;

  googleDriveService.uploadFile = async () => ({
    id: 'gdrive-file-mock-123',
    name: 'Agreement_AGR-2026-0001_Joel.pdf',
    mimeType: 'application/pdf',
    webViewLink: 'https://drive.google.com/mock-link-123'
  });

  googleDriveService.getOrCreateProjectFolderStructure = async () => ({
    driveFolderId: 'folder-root',
    agreementsFolderId: 'folder-agreements'
  });

  // Common Mock Data
  const mockProjectData = {
    id: 'project-1',
    name: 'Joel Wedding Project',
    clientId: 'client-rec-1',
    driveFolderId: 'folder-root',
    agreementsFolderId: 'folder-agreements',
    client: {
      id: 'client-rec-1',
      name: 'Joel',
      email: 'joel@apco.com'
    }
  };

  const testManagerUser = { id: 'mgr-1', email: 'manager@apco.com', role: Role.Manager };
  const testClientUser = { id: 'client-1', email: 'client@apco.com', role: Role.Client };

  // Run tests
  try {
    await testCase('RBAC: Non-admin/manager roles are blocked from generating agreements', async () => {
      mockPrisma.project = {
        findFirst: async () => mockProjectData
      };

      const { req, res, next, results } = mockRequestResponse(
        {},
        { projectId: 'project-1' },
        {},
        null,
        testClientUser
      );

      await generateProjectAgreement(req, res, next);
      const { statusCode, nextError } = results();

      if (statusCode !== 403 && (!nextError || nextError.statusCode !== 403)) {
        throw new Error(`Expected 403 status code, got ${statusCode}`);
      }
    });

    await testCase('Generate: Successfully generates, uploads and registers agreement with AGR serial number', async () => {
      let fileCreated: any = null;
      let agreementCreated: any = null;

      mockPrisma.project = {
        findFirst: async () => mockProjectData,
        update: async () => mockProjectData
      };
      mockPrisma.quotation = {
        findFirst: async () => ({ id: 'quo-1', amount: 80000 })
      };
      mockPrisma.invoice = {
        findFirst: async () => null
      };
      mockPrisma.payment = {
        findMany: async () => [{ amount: 30000, status: 'SUCCESSFUL' }]
      };
      mockPrisma.task = {
        findFirst: async () => null
      };
      mockPrisma.event = {
        findFirst: async () => ({ name: 'Wedding Engagement', date: new Date('2026-06-30') })
      };
      mockPrisma.file = {
        create: async (args: any) => {
          fileCreated = args.data;
          return { id: 'file-rec-99', ...args.data };
        }
      };
      mockPrisma.agreement = {
        create: async (args: any) => {
          agreementCreated = args.data;
          return { id: 'agr-rec-99', ...args.data };
        }
      };
      mockPrisma.auditLog = {
        create: async () => ({})
      };
      mockPrisma.workflowEvent = {
        create: async () => ({})
      };

      const { req, res, next, results } = mockRequestResponse(
        {},
        { projectId: 'project-1' },
        {},
        null,
        testManagerUser
      );

      await generateProjectAgreement(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (statusCode !== 201) {
        throw new Error(`Expected 201, got ${statusCode}. nextError: ${nextError?.message || nextError}`);
      }

      if (!responseData.success || !responseData.agreementNumber) {
        throw new Error('Response should indicate success and contain agreement number');
      }

      if (responseData.status !== 'Generated') {
        throw new Error(`Expected status 'Generated', got ${responseData.status}`);
      }

      if (!fileCreated || fileCreated.category !== 'Agreements') {
        throw new Error('File record was not correctly populated or category was wrong');
      }

      if (!agreementCreated || !/^AGR-\d{4}-\d{4}$/.test(agreementCreated.agreementNumber)) {
        throw new Error(`Agreement number format is invalid: ${agreementCreated?.agreementNumber}`);
      }

      if (agreementCreated.status !== 'Generated') {
        throw new Error(`Expected status 'Generated' in database, got ${agreementCreated.status}`);
      }
    });

    await testCase('Generate: Respects custom overrides passed in body', async () => {
      mockPrisma.project = {
        findFirst: async () => mockProjectData,
        update: async () => mockProjectData
      };
      mockPrisma.quotation = {
        findFirst: async () => ({ id: 'quo-1', amount: 80000 })
      };
      mockPrisma.invoice = {
        findFirst: async () => null
      };
      mockPrisma.payment = {
        findMany: async () => []
      };
      mockPrisma.task = {
        findFirst: async () => null
      };
      mockPrisma.event = {
        findFirst: async () => null
      };
      mockPrisma.file = {
        create: async (args: any) => ({ id: 'file-rec-99', ...args.data })
      };
      mockPrisma.agreement = {
        create: async (args: any) => ({ id: 'agr-rec-99', ...args.data })
      };
      mockPrisma.auditLog = {
        create: async () => ({})
      };
      mockPrisma.workflowEvent = {
        create: async () => ({})
      };

      const overrideData = {
        clientName: 'Joel & Jane Doe',
        eventName: 'Exclusive Beach Wedding',
        eventDate: '15 December 2026',
        totalAmount: 120000,
        advanceAmount: 40000,
        balanceAmount: 80000,
        todayDate: '19 June 2026'
      };

      const { req, res, next, results } = mockRequestResponse(
        overrideData,
        { projectId: 'project-1' },
        {},
        null,
        testManagerUser
      );

      await generateProjectAgreement(req, res, next);
      const { statusCode, nextError } = results();

      if (statusCode !== 201) {
        throw new Error(`Expected 201, got ${statusCode}. nextError: ${nextError?.message || nextError}`);
      }
    });

  } finally {
    // Restore original mock models
    mockPrisma.file = originalFile;
    mockPrisma.project = originalProject;
    mockPrisma.quotation = originalQuotation;
    mockPrisma.invoice = originalInvoice;
    mockPrisma.payment = originalPayment;
    mockPrisma.task = originalTask;
    mockPrisma.event = originalEvent;
    mockPrisma.agreement = originalAgreement;
    mockPrisma.auditLog = originalAuditLog;
    mockPrisma.workflowEvent = originalWorkflowEvent;
    mockPrisma.companyProfile = originalCompanyProfile;

    // Restore GDrive functions
    googleDriveService.uploadFile = originalUpload;
    googleDriveService.getOrCreateProjectFolderStructure = originalFolderStructure;
  }

  if (failed > 0) {
    console.log(`\n❌ AGREEMENT TESTS COMPLETED WITH FAILURES: Passed: ${passed}, Failed: ${failed}`);
    throw new Error('Some agreement generation tests failed.');
  } else {
    console.log(`\n🎉 ALL ${passed} AGREEMENT GENERATION TESTS PASSED SUCCESSFULLY!`);
  }
}
