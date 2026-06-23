import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role } from '@prisma/client';
import { AppError } from '../middleware/error';

// Import controller functions to test
import {
  createProject,
  updateProject,
  assignStaff,
  removeStaff,
  getProjects,
  getProjectById
} from '../modules/projects/projects.controller';

import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  getUnreadCount
} from '../modules/notifications/notifications.controller';
import { NotificationService } from '../services/notification.service';

import {
  getCompanies,
  saveCompany,
  deleteCompany,
  getGlobalSettings,
  saveGlobalSettings,
  getCompanyById
} from '../modules/settings/settings.controller';

import {
  getInvoices,
  createInvoice,
  updateInvoice,
  createQuotation,
  createAgreement,
  recordPayment,
  getQuotations,
  getAgreements
} from '../modules/invoices/invoices.controller';

import {
  getUploadUrl,
  confirmUpload,
  downloadFile,
  deleteFile
} from '../modules/files/files.controller';

import { getProjectTimeline } from '../modules/workflow/workflow.controller';

import {
  getTasks,
  createTask,
  updateTask
} from '../modules/tasks/tasks.controller';

import {
  verifyApproval
} from '../modules/approvals/approvals.controller';

import {
  createPersonnel
} from '../modules/personnel/personnel.controller';

import {
  createAgreementTemplate
} from '../modules/templates/templates.controller';

import { updateProjectStage, updateStaffAssignedEvents } from '../modules/projects/projects.controller';
import {
  createClient,
  updateClient,
  deleteClient
} from '../modules/clients/clients.controller';
import {
  activateClient
} from '../modules/auth/auth.controller';
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent
} from '../modules/events/events.controller';

// Mock storage service functions since R2 is not configured
import * as storageService from '../services/storage.service';
import * as s3Config from '../config/s3';

(s3Config as any).isR2Configured = () => true;
(storageService as any).getPresignedUploadUrl = async () => 'https://mock-r2-upload-url.com/file-key';
(storageService as any).getPresignedDownloadUrl = async () => 'https://mock-r2-download-url.com/file-key';

// Silence console during tests
const originalWarn = console.warn;
const originalError = console.error;
const originalLog = console.log;

function silenceLogs() {
  console.warn = () => {};
  console.error = () => {};
  console.log = () => {};
}

function restoreLogs() {
  console.warn = originalWarn;
  console.error = originalError;
  console.log = originalLog;
}

// Helper to create mocked Request & Response objects
function createMockRequestResponse(body = {}, params = {}, query = {}, headers = {}, user?: any) {
  const req = {
    body,
    params,
    query,
    headers: {
      'user-agent': 'TestRunner/1.0',
      'sec-ch-ua': 'TestRunnerChrome',
      ...headers,
    },
    ip: '127.0.0.1',
    requestId: 'test-correlation-id',
    user,
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
  } as unknown as Response;

  const next = (err?: any) => {
    nextError = err;
  };

  return {
    req,
    res,
    next,
    getResults() {
      return { statusCode, responseData, nextError };
    },
  };
}

async function runTests() {
  console.log('\n🧪 Starting APCO Comprehensive Integration Tests...\n');
  let passedCount = 0;
  let failedCount = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    silenceLogs();
    try {
      await fn();
      restoreLogs();
      console.log(`✅ [PASSED] ${name}`);
      passedCount++;
    } catch (error: any) {
      restoreLogs();
      console.log(`❌ [FAILED] ${name}`);
      console.error(`   Reason: ${error.message || error}`);
      if (error.stack) {
        console.error(error.stack.split('\n').slice(0, 3).join('\n'));
      }
      failedCount++;
    }
  }

  // Setup globally mocked models on prisma to prevent any real DB calls
  const mockPrisma = prisma as any;
  mockPrisma.$transaction = async (callback: (tx: any) => Promise<any>) => {
    return callback(mockPrisma);
  };
  let rawQueryCounter = 0;
  mockPrisma.$queryRaw = async () => {
    rawQueryCounter++;
    return [{ lastValue: rawQueryCounter }];
  };
  mockPrisma.auditLog = { create: async () => ({}) };
  mockPrisma.securityEvent = { create: async () => ({}) };
  mockPrisma.notification = {
    create: async (args: any) => ({ id: 'notif-id', ...args.data }),
    createMany: async () => ({ count: 1 }),
    findMany: async () => [],
    findUnique: async () => null,
    update: async (args: any) => ({ id: 'notif-id', ...args.data }),
    updateMany: async () => ({ count: 1 }),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 1 }),
  };
  mockPrisma.project = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'proj-id', ...args.data }),
    update: async (args: any) => ({ id: 'proj-id', ...args.data }),
    updateMany: async () => ({ count: 1 }),
  };
  mockPrisma.client = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
  };
  mockPrisma.event = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'event-id', ...args.data }),
    createMany: async () => ({ count: 1 }),
    update: async (args: any) => ({ id: 'event-id', ...args.data }),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 1 }),
  };
  mockPrisma.companyProfile = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'comp-id', ...args.data }),
    update: async (args: any) => ({ id: 'comp-id', ...args.data }),
    updateMany: async () => ({ count: 1 }),
  };
  mockPrisma.globalSetting = {
    findMany: async () => [],
    findUnique: async () => null,
    upsert: async (args: any) => ({ key: args.where.key, value: args.create.value }),
  };
  mockPrisma.invoice = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'inv-id', ...args.data }),
    update: async (args: any) => ({ id: 'inv-id', ...args.data }),
  };
  mockPrisma.invoiceItem = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  };
  mockPrisma.quotation = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'quo-id', ...args.data }),
    update: async (args: any) => ({ id: 'quo-id', ...args.data }),
  };
  mockPrisma.quotationItem = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  };
  mockPrisma.expense = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'exp-id', ...args.data }),
    update: async (args: any) => ({ id: 'exp-id', ...args.data }),
  };
  mockPrisma.agreement = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'agr-id', ...args.data }),
  };
  mockPrisma.payment = {
    create: async (args: any) => ({ id: 'pay-id', ...args.data }),
  };
  mockPrisma.file = {
    findUnique: async () => null,
    create: async (args: any) => ({ id: 'file-id', ...args.data }),
    update: async (args: any) => ({ id: 'file-id', ...args.data }),
  };
  mockPrisma.workflowEvent = {
    create: async (args: any) => ({ id: 'event-id', ...args.data }),
    findMany: async () => [],
  };
  mockPrisma.staffAssignment = {
    findFirst: async () => null,
    findMany: async () => [],
    create: async (args: any) => ({ id: 'assign-id', ...args.data }),
    delete: async () => ({}),
    update: async (args: any) => ({ id: 'assign-id', ...args.data }),
  };
  mockPrisma.user = {
    findUnique: async () => null,
    findFirst: async () => null,
  };

  mockPrisma.task = {
    findMany: async () => [],
    findUnique: async () => null,
    findFirst: async () => null,
    create: async (args: any) => ({ id: 'task-id', ...args.data }),
    update: async (args: any) => ({ id: 'task-id', ...args.data }),
    delete: async () => ({}),
  };
  mockPrisma.approval = {
    findMany: async () => [],
    findUnique: async () => null,
    findFirst: async () => null,
    create: async (args: any) => ({ id: 'appr-id', ...args.data }),
    update: async (args: any) => ({ id: 'appr-id', ...args.data }),
    delete: async () => ({}),
  };
  mockPrisma.personnel = {
    findMany: async () => [],
    findUnique: async () => null,
    findFirst: async () => null,
    create: async (args: any) => ({ id: 'pers-id', ...args.data }),
    update: async (args: any) => ({ id: 'pers-id', ...args.data }),
    delete: async () => ({}),
  };
  mockPrisma.agreementTemplate = {
    findMany: async () => [],
    findUnique: async () => null,
    findFirst: async () => null,
    create: async (args: any) => ({ id: 'at-id', ...args.data }),
    update: async (args: any) => ({ id: 'at-id', ...args.data }),
    delete: async () => ({}),
  };
  mockPrisma.customTemplate = {
    findMany: async () => [],
    findUnique: async () => null,
    findFirst: async () => null,
    create: async (args: any) => ({ id: 'ct-id', ...args.data }),
    update: async (args: any) => ({ id: 'ct-id', ...args.data }),
    delete: async () => ({}),
  };

  // Common Mock Data
  const adminUser = { id: 'admin-id', email: 'admin@apco.com', firstName: 'Admin', lastName: 'User', role: Role.SystemAdmin, mfaEnabled: false, mustChangePassword: false };
  const managerUser = { id: 'manager-id', email: 'manager@apco.com', firstName: 'Manager', lastName: 'User', role: Role.Manager, mfaEnabled: false, mustChangePassword: false };
  const photographerUser = { id: 'photographer-id', email: 'photographer@apco.com', firstName: 'Photo', lastName: 'Grapher', role: Role.Photographer, mfaEnabled: false, mustChangePassword: false };
  const clientUser = { id: 'client-user-id', email: 'client@apco.com', firstName: 'Client', lastName: 'User', role: Role.Client, mfaEnabled: false, mustChangePassword: false };

  const mockClientRecord = { id: 'client-rec-id', name: 'Client Corp', email: 'client@apco.com', deletedAt: null };
  const mockProjectRecord = { id: 'project-uuid', name: 'Test Project', status: 'Draft', clientId: 'client-rec-id', deletedAt: null };

  // ==========================================
  // RBAC Tests
  // ==========================================
  await testCase('RBAC: Non-admin/manager cannot create project', async () => {
    const { req, res, next, getResults } = createMockRequestResponse(
      { name: 'Proj', clientId: 'client-rec-id' },
      {}, {}, {}, photographerUser
    );

    await createProject(req, res, next);
    const { nextError } = getResults();

    if (!nextError || !(nextError instanceof AppError) || nextError.statusCode !== 403) {
      throw new Error('Expected 403 AppError for unauthorized role.');
    }
  });

  await testCase('RBAC: Admin/manager can create project', async () => {
    mockPrisma.client.findFirst = async () => mockClientRecord;
    mockPrisma.project.create = async (args: any) => ({ id: 'proj-new-id', ...args.data });
    mockPrisma.workflowEvent.create = async () => ({});

    const { req, res, next, getResults } = createMockRequestResponse(
      { name: 'New Proj', status: 'Draft', clientId: 'client-rec-id' },
      {}, {}, {}, managerUser
    );

    await createProject(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 201 || responseData.id !== 'proj-new-id') {
      throw new Error('Expected successful creation (201).');
    }
  });

  await testCase('RBAC: Non-admin/manager cannot create invoice', async () => {
    const { req, res, next, getResults } = createMockRequestResponse(
      { projectId: 'proj-id', clientId: 'cli-id', amount: 100, dueDate: '2026-07-01' },
      {}, {}, {}, photographerUser
    );

    await createInvoice(req, res, next);
    const { nextError } = getResults();

    if (!nextError || nextError.statusCode !== 403) {
      throw new Error('Expected 403 invoice creation block.');
    }
  });

  // ==========================================
  // Workflows Tests
  // ==========================================
  await testCase('Workflows: Create Project logs PROJECT_CREATED event', async () => {
    const loggedEvents: any[] = [];
    mockPrisma.client.findFirst = async () => mockClientRecord;
    mockPrisma.project.create = async () => mockProjectRecord;
    mockPrisma.workflowEvent.create = async (args: any) => {
      loggedEvents.push(args.data);
      return { id: 'event-id', ...args.data };
    };

    const { req, res, next } = createMockRequestResponse(
      { name: 'Test Project', clientId: 'client-rec-id' },
      {}, {}, {}, adminUser
    );

    await createProject(req, res, next);

    const hasCreatedEvent = loggedEvents.some(e => e.eventType === 'PROJECT_CREATED');
    if (!hasCreatedEvent) {
      throw new Error('PROJECT_CREATED workflow event was not generated.');
    }
  });

  await testCase('Workflows: Status update logs MILESTONE_UPDATED and notifies client', async () => {
    let loggedEvent: any = null;
    let loggedNotification: any = null;

    mockPrisma.project.findFirst = async () => mockProjectRecord;
    mockPrisma.project.update = async (args: any) => ({ ...mockProjectRecord, ...args.data });
    mockPrisma.workflowEvent.create = async (args: any) => {
      loggedEvent = args.data;
      return { id: 'event-id', ...args.data };
    };
    mockPrisma.client.findUnique = async () => mockClientRecord;
    mockPrisma.user.findUnique = async () => clientUser;
    mockPrisma.notification.create = async (args: any) => {
      loggedNotification = args.data;
      return { id: 'notif-id', ...args.data };
    };

    const { req, res, next } = createMockRequestResponse(
      { status: 'In Progress' },
      { id: 'project-uuid' },
      {}, {}, adminUser
    );

    await updateProject(req, res, next);

    if (!loggedEvent || loggedEvent.eventType !== 'MILESTONE_UPDATED') {
      throw new Error('MILESTONE_UPDATED event was not logged.');
    }
    if (!loggedNotification || loggedNotification.userId !== clientUser.id) {
      throw new Error('Client was not notified of project status change.');
    }
  });

  await testCase('Workflows: Staff assignment logs STAFF_ASSIGNED', async () => {
    let loggedEvent: any = null;
    mockPrisma.project.findFirst = async () => mockProjectRecord;
    mockPrisma.user.findUnique = async () => photographerUser;
    mockPrisma.staffAssignment.findFirst = async () => null; // No duplicate
    mockPrisma.staffAssignment.create = async (args: any) => ({ id: 'assign-id', ...args.data });
    mockPrisma.notification.create = async () => ({});
    mockPrisma.workflowEvent.create = async (args: any) => {
      loggedEvent = args.data;
      return {};
    };

    const { req, res, next } = createMockRequestResponse(
      { userId: photographerUser.id, role: Role.Photographer },
      { id: 'project-uuid' },
      {}, {}, adminUser
    );

    await assignStaff(req, res, next);

    if (!loggedEvent || loggedEvent.eventType !== 'STAFF_ASSIGNED') {
      throw new Error('STAFF_ASSIGNED workflow event not generated.');
    }
  });

  await testCase('Workflows: Staff removal logs STAFF_REMOVED', async () => {
    let loggedEvent: any = null;
    mockPrisma.staffAssignment.findFirst = async () => ({ id: 'assign-id', projectId: 'project-uuid', userId: photographerUser.id });
    mockPrisma.staffAssignment.delete = async () => ({});
    mockPrisma.workflowEvent.create = async (args: any) => {
      loggedEvent = args.data;
      return {};
    };

    const { req, res, next } = createMockRequestResponse(
      { userId: photographerUser.id },
      { id: 'project-uuid' },
      {}, {}, adminUser
    );

    await removeStaff(req, res, next);

    if (!loggedEvent || loggedEvent.eventType !== 'STAFF_REMOVED') {
      throw new Error('STAFF_REMOVED workflow event not generated.');
    }
  });

  await testCase('Staff Assignments: Update assigned event IDs', async () => {
    let loggedEvent: any = null;
    mockPrisma.project.findFirst = async () => mockProjectRecord;
    mockPrisma.staffAssignment.findFirst = async () => ({ id: 'assign-id', projectId: 'project-uuid', userId: photographerUser.id });
    mockPrisma.staffAssignment.update = async (args: any) => ({ id: 'assign-id', ...args.data });
    mockPrisma.event.findMany = async () => [{ id: 'event-1', clientId: 'client-rec-id' }];
    mockPrisma.workflowEvent.create = async (args: any) => {
      loggedEvent = args.data;
      return {};
    };

    const { req, res, next, getResults } = createMockRequestResponse(
      { eventIds: ['event-1'] },
      { id: 'project-uuid', userId: photographerUser.id },
      {}, {}, adminUser
    );

    await updateStaffAssignedEvents(req, res, next);
    const { statusCode, responseData } = getResults();

    if (statusCode !== 200) {
      throw new Error(`Expected status 200, got ${statusCode}`);
    }
    if (!responseData.eventIds || !responseData.eventIds.includes('event-1')) {
      throw new Error('Event IDs were not updated in the response.');
    }
    if (!loggedEvent || loggedEvent.eventType !== 'STAFF_EVENTS_UPDATED') {
      throw new Error('STAFF_EVENTS_UPDATED workflow event not generated.');
    }
  });

  await testCase('Workflows: Agreement creation logs AGREEMENT_CREATED', async () => {
    let loggedEvent: any = null;
    mockPrisma.project.findUnique = async () => mockProjectRecord;
    mockPrisma.companyProfile.findFirst = async () => null; // fallback
    mockPrisma.agreement.create = async (args: any) => ({ id: 'agr-id', ...args.data });
    mockPrisma.workflowEvent.create = async (args: any) => {
      loggedEvent = args.data;
      return { id: 'event-id', ...args.data };
    };

    const { req, res, next } = createMockRequestResponse(
      { projectId: 'project-uuid', clientId: 'client-rec-id', status: 'Draft' },
      {}, {}, {}, adminUser
    );

    await createAgreement(req, res, next);

    if (!loggedEvent || loggedEvent.eventType !== 'AGREEMENT_CREATED') {
      throw new Error('AGREEMENT_CREATED workflow event not generated.');
    }
  });

  // ==========================================
  // Notifications Tests
  // ==========================================
  await testCase('Notifications: Delete a single notification (ownership check)', async () => {
    let deleted = false;
    mockPrisma.notification.findUnique = async () => ({ id: 'notif-1', userId: 'photographer-id' });
    mockPrisma.notification.delete = async () => {
      deleted = true;
      return {};
    };

    // User is photographer-id (owner), should succeed
    const { req: reqOwner, res: resOwner, next: nextOwner, getResults: resultsOwner } = createMockRequestResponse(
      {}, { id: 'notif-1' }, {}, {}, photographerUser
    );
    await deleteNotification(reqOwner, resOwner, nextOwner);
    if (resultsOwner().nextError) throw resultsOwner().nextError;
    if (!deleted) throw new Error('Failed to delete notification.');

    // User is client-user-id (non-owner), should fail 403
    deleted = false;
    const { req: reqNonOwner, res: resNonOwner, next: nextNonOwner, getResults: resultsNonOwner } = createMockRequestResponse(
      {}, { id: 'notif-1' }, {}, {}, clientUser
    );
    await deleteNotification(reqNonOwner, resNonOwner, nextNonOwner);
    const err = resultsNonOwner().nextError;
    if (!err || err.statusCode !== 403) {
      throw new Error('Expected 403 for non-owner notification deletion.');
    }
  });

  await testCase('Notifications: Delete all user notifications', async () => {
    let deleteWhere: any = null;
    mockPrisma.notification.deleteMany = async (args: any) => {
      deleteWhere = args.where;
      return { count: 5 };
    };

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, photographerUser
    );

    await deleteAllNotifications(req, res, next);
    const { statusCode } = getResults();

    if (statusCode !== 200 || !deleteWhere || deleteWhere.userId !== photographerUser.id) {
      throw new Error('Delete all did not properly target user id.');
    }
  });

  // ==========================================
  // Settings Tests
  // ==========================================
  await testCase('Settings: Leakage protection on global settings', async () => {
    const dbSettings = [
      { key: 'site_title', value: 'APCO Production' },
      { key: 'smtp_password', value: 'secret-email-pass-123' },
    ];
    mockPrisma.globalSetting.findMany = async () => dbSettings;

    // Admin should see both
    const { req: reqAdmin, res: resAdmin, next: nextAdmin, getResults: resultsAdmin } = createMockRequestResponse(
      {}, {}, {}, {}, adminUser
    );
    await getGlobalSettings(reqAdmin, resAdmin, nextAdmin);
    if (resultsAdmin().responseData.smtp_password !== 'secret-email-pass-123') {
      throw new Error('Admin was blocked from reading sensitive settings.');
    }

    // Client should NOT see smtp_password
    const { req: reqClient, res: resClient, next: nextClient, getResults: resultsClient } = createMockRequestResponse(
      {}, {}, {}, {}, clientUser
    );
    await getGlobalSettings(reqClient, resClient, nextClient);
    if (resultsClient().responseData.smtp_password !== undefined) {
      throw new Error('Sensitive setting was leaked to non-admin user.');
    }
  });

  await testCase('Settings: Get company by ID', async () => {
    const mockCompany = { id: 'comp-1', companyName: 'Brand A', deletedAt: null };
    mockPrisma.companyProfile.findUnique = async () => mockCompany;

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { id: 'comp-1' }, {}, {}, photographerUser
    );

    await getCompanyById(req, res, next);
    const { responseData } = getResults();

    if (!responseData || responseData.companyName !== 'Brand A') {
      throw new Error('Company by ID failed to fetch profile.');
    }
  });

  // ==========================================
  // File Operations Tests
  // ==========================================
  await testCase('File Operations: Presigned download URL access checking', async () => {
    const securedFile = { id: 'file-1', key: 'uploads/f.png', originalName: 'f.png', mimeType: 'image/png', isSecured: true, userId: 'uploader-id', projectId: 'project-1' };
    mockPrisma.file.findUnique = async () => securedFile;

    // Photographer (not assigned, not owner) gets 403
    mockPrisma.staffAssignment.findFirst = async () => null;
    const { req: reqPhoto, res: resPhoto, next: nextPhoto, getResults: resultsPhoto } = createMockRequestResponse(
      {}, { fileId: 'file-1' }, {}, {}, photographerUser
    );
    await downloadFile(reqPhoto, resPhoto, nextPhoto);
    if (!resultsPhoto().nextError || resultsPhoto().nextError.statusCode !== 403) {
      throw new Error('Secured file was downloaded by non-assigned non-admin staff.');
    }

    // Assigned Photographer succeeds
    mockPrisma.staffAssignment.findFirst = async () => ({ id: 'assign-id' });
    const { req: reqAssigned, res: resAssigned, next: nextAssigned, getResults: resultsAssigned } = createMockRequestResponse(
      {}, { fileId: 'file-1' }, {}, {}, photographerUser
    );
    await downloadFile(reqAssigned, resAssigned, nextAssigned);
    if (resultsAssigned().nextError) throw resultsAssigned().nextError;
    if (!resultsAssigned().responseData.downloadUrl) {
      throw new Error('Download URL was not generated for assigned staff.');
    }
  });

  // ==========================================
  // Additional Project Tests
  // ==========================================
  await testCase('Projects: List projects', async () => {
    mockPrisma.client.findFirst = async () => mockClientRecord;
    mockPrisma.project.findMany = async () => [mockProjectRecord];

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, photographerUser
    );
    await getProjects(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to list projects.');
    }
  });

  await testCase('Projects: Get project by ID', async () => {
    mockPrisma.project.findFirst = async () => ({
      ...mockProjectRecord,
      client: mockClientRecord,
      staffAssignments: [{ userId: photographerUser.id }]
    });

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { id: 'proj-1' }, {}, {}, photographerUser
    );
    await getProjectById(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.id !== mockProjectRecord.id) {
      throw new Error('Failed to fetch project by ID.');
    }
  });

  // ==========================================
  // Additional Notification Tests
  // ==========================================
  await testCase('Notifications: List notifications', async () => {
    mockPrisma.notification.findMany = async () => [{ id: 'notif-1', isRead: false }];

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, photographerUser
    );
    await getNotifications(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to list notifications.');
    }
  });

  await testCase('Notifications: Mark as read', async () => {
    mockPrisma.notification.findUnique = async () => ({ id: 'notif-1', userId: photographerUser.id });
    mockPrisma.notification.update = async (args: any) => ({ id: 'notif-1', isRead: args.data.isRead });

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { id: 'notif-1' }, {}, {}, photographerUser
    );
    await markAsRead(req, res, next);
    const { responseData } = getResults();
    if (!responseData || !responseData.isRead) {
      throw new Error('Failed to mark notification as read.');
    }
  });

  await testCase('Notifications: Mark all as read', async () => {
    mockPrisma.notification.updateMany = async () => ({ count: 2 });

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, photographerUser
    );
    await markAllAsRead(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.message !== 'All notifications marked as read.') {
      throw new Error('Failed to mark all notifications as read.');
    }
  });

  await testCase('Notifications: Get unread count', async () => {
    mockPrisma.notification.count = async () => 5;

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, photographerUser
    );
    await getUnreadCount(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.count !== 5) {
      throw new Error('Failed to retrieve unread notification count.');
    }
  });

  await testCase('Notifications: NotificationService Abstraction Layer', async () => {
    let createdNotificationData: any = null;
    mockPrisma.notification.create = async (args: any) => {
      createdNotificationData = args.data;
      return { id: 'notif-xyz', ...args.data };
    };

    const payload = { title: 'Test Service', message: 'Decoupled delivery' };
    const res = await NotificationService.emitNotification(photographerUser.id, payload);

    if (!res || res.id !== 'notif-xyz' || !createdNotificationData) {
      throw new Error('NotificationService failed to emit single notification.');
    }
    if (createdNotificationData.title !== 'Test Service' || createdNotificationData.userId !== photographerUser.id) {
      throw new Error('NotificationService payload/userId mapping failed.');
    }
  });

  // ==========================================
  // Additional Settings Tests
  // ==========================================
  await testCase('Settings: List companies', async () => {
    mockPrisma.companyProfile.findMany = async () => [{ id: 'comp-1', companyName: 'Brand A' }];

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, photographerUser
    );
    await getCompanies(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to list companies.');
    }
  });

  await testCase('Settings: Save company profile', async () => {
    const newCompany = { companyName: 'Brand B', projectType: 'Photo', email: 'b@b.com', phone: '123', invoicePrefix: 'B', isDefault: true };
    mockPrisma.companyProfile.create = async (args: any) => ({ id: 'comp-2', ...args.data });
    mockPrisma.companyProfile.updateMany = async () => ({ count: 1 });

    const { req, res, next, getResults } = createMockRequestResponse(
      newCompany, {}, {}, {}, adminUser
    );
    await saveCompany(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.companyName !== 'Brand B') {
      throw new Error('Failed to save company profile.');
    }
  });

  await testCase('Settings: Delete company profile', async () => {
    mockPrisma.companyProfile.findUnique = async () => ({ id: 'comp-2', companyName: 'Brand B' });
    mockPrisma.companyProfile.update = async () => ({ id: 'comp-2', deletedAt: new Date() });

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { id: 'comp-2' }, {}, {}, adminUser
    );
    await deleteCompany(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.message !== 'Company profile deleted successfully.') {
      throw new Error('Failed to delete company profile.');
    }
  });

  await testCase('Settings: Save global settings bulk', async () => {
    mockPrisma.globalSetting.upsert = async (args: any) => ({ key: args.where.key, value: args.create.value });

    const { req, res, next, getResults } = createMockRequestResponse(
      { theme: 'dark', language: 'en' }, {}, {}, {}, adminUser
    );
    await saveGlobalSettings(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.message !== 'Settings saved successfully.') {
      throw new Error('Failed to save global settings bulk.');
    }
  });

  // ==========================================
  // Additional Invoices / Quotations / Agreements Tests
  // ==========================================
  await testCase('Invoices: List invoices', async () => {
    mockPrisma.invoice.findMany = async () => [{ id: 'inv-1', amount: 500 }];

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, adminUser
    );
    await getInvoices(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to list invoices.');
    }
  });

  await testCase('Invoices: Update invoice', async () => {
    mockPrisma.invoice.findFirst = async () => ({ id: 'inv-1', amount: 500 });
    mockPrisma.invoice.update = async (args: any) => ({ id: 'inv-1', ...args.data });

    const { req, res, next, getResults } = createMockRequestResponse(
      { amount: 600 }, { id: 'inv-1' }, {}, {}, adminUser
    );
    await updateInvoice(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.amount !== 600) {
      throw new Error('Failed to update invoice.');
    }
  });

  await testCase('Invoices: Create Quotation', async () => {
    mockPrisma.project.findFirst = async () => mockProjectRecord;
    mockPrisma.project.findUnique = async () => mockProjectRecord;
    mockPrisma.client.findFirst = async () => mockClientRecord;
    mockPrisma.companyProfile.findFirst = async () => null; // fallback prefix
    mockPrisma.quotation.create = async (args: any) => ({ id: 'quo-1', ...args.data });

    const { req, res, next, getResults } = createMockRequestResponse(
      { projectId: 'proj-1', clientId: 'cli-1', amount: 1500, status: 'Draft', validUntil: '2026-08-01' },
      {}, {}, {}, adminUser
    );
    await createQuotation(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.amount !== 1500) {
      throw new Error('Failed to create quotation.');
    }
  });

  await testCase('Invoices: List quotations', async () => {
    mockPrisma.quotation.findMany = async () => [{ id: 'quo-1', amount: 1500 }];

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, adminUser
    );
    await getQuotations(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to list quotations.');
    }
  });

  await testCase('Invoices: List agreements', async () => {
    mockPrisma.agreement.findMany = async () => [{ id: 'agr-1', agreementNumber: 'AGR-1' }];

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, {}, {}, {}, adminUser
    );
    await getAgreements(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to list agreements.');
    }
  });

  await testCase('Invoices: Record payment updates invoice to Paid', async () => {
    let updatedInvoiceData: any = null;
    mockPrisma.invoice.findUnique = async () => ({ id: 'inv-1', projectId: 'project-uuid', clientId: 'client-rec-id', invoiceNumber: 'INV-101' });
    mockPrisma.payment.create = async (args: any) => ({ id: 'pay-1', ...args.data });
    mockPrisma.invoice.update = async (args: any) => {
      updatedInvoiceData = args.data;
      return {};
    };
    mockPrisma.client.findUnique = async () => mockClientRecord;
    mockPrisma.user.findFirst = async () => clientUser;
    mockPrisma.notification.create = async () => ({});

    const { req, res, next, getResults } = createMockRequestResponse(
      { amount: 500, status: 'Successful', paymentMethod: 'Card', transactionId: 'txn-123' },
      { id: 'inv-1' }, {}, {}, adminUser
    );
    await recordPayment(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.invoiceId !== 'inv-1') {
      throw new Error('Failed to record payment.');
    }
    if (!updatedInvoiceData || updatedInvoiceData.status !== 'Paid') {
      throw new Error('Payment receipt did not trigger invoice transition to Paid.');
    }
  });

  // ==========================================
  // Additional File Operations Tests
  // ==========================================
  await testCase('Files: Get Upload URL', async () => {
    const { req, res, next, getResults } = createMockRequestResponse(
      { fileName: 'photo.jpg', mimeType: 'image/jpeg', size: 2048, projectId: 'project-uuid' },
      {}, {}, {}, photographerUser
    );
    await getUploadUrl(req, res, next);
    const { responseData } = getResults();
    if (!responseData || !responseData.uploadUrl || responseData.userId !== photographerUser.id) {
      throw new Error('Failed to get upload URL.');
    }
  });

  await testCase('Files: Confirm upload', async () => {
    mockPrisma.file.findUnique = async () => null; // File key is unique
    mockPrisma.file.create = async (args: any) => ({ id: 'file-2', ...args.data });

    const { req, res, next, getResults } = createMockRequestResponse(
      { key: 'uploads/f-2.png', originalName: 'f-2.png', mimeType: 'image/png', size: 100, hash: 'sha-2', isSecured: false, projectId: 'project-uuid' },
      {}, {}, {}, photographerUser
    );
    await confirmUpload(req, res, next);
    const { responseData } = getResults();
    if (!responseData || !responseData.file || responseData.file.id !== 'file-2') {
      throw new Error('Failed to confirm file upload.');
    }
  });

  await testCase('Files: Soft delete file', async () => {
    mockPrisma.file.findUnique = async () => ({ id: 'file-2', userId: photographerUser.id, key: 'uploads/f-2.png', originalName: 'f-2.png' });
    mockPrisma.file.update = async () => ({ id: 'file-2' });

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { fileId: 'file-2' }, {}, {}, photographerUser
    );
    await deleteFile(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.message !== 'File successfully deleted.') {
      throw new Error('Failed to soft delete file.');
    }
  });

  // ==========================================
  // Additional Workflow Tests
  // ==========================================
  await testCase('Workflow: Get timeline with client access check', async () => {
    mockPrisma.project.findFirst = async () => ({
      ...mockProjectRecord,
      client: mockClientRecord,
      staffAssignments: []
    });
    mockPrisma.workflowEvent.findMany = async () => [{ id: 'ev-1', eventType: 'PROJECT_CREATED' }];

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { projectId: 'project-uuid' }, {}, {}, clientUser
    );
    await getProjectTimeline(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to fetch timeline.');
    }
  });

  // ==========================================
  // Phase 5 Integration Tests
  // ==========================================
  await testCase('Tasks: Get tasks as admin', async () => {
    mockPrisma.task.findMany = async () => [{ id: 'task-1', title: 'Test Task', assignee: 'Unassigned' }];
    const { req, res, next, getResults } = createMockRequestResponse({}, {}, {}, {}, adminUser);
    await getTasks(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.length !== 1) {
      throw new Error('Failed to get tasks as admin.');
    }
  });

  await testCase('Tasks: Create task manually', async () => {
    const taskData = {
      title: 'Manual Task',
      dueDate: new Date().toISOString(),
      brand: 'Artisans',
      priority: 'High'
    };
    const { req, res, next, getResults } = createMockRequestResponse(taskData, {}, {}, {}, adminUser);
    await createTask(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.title !== 'Manual Task') {
      throw new Error('Failed to create task as admin.');
    }
  });

  await testCase('Approvals: Verify approval records and cascades', async () => {
    let invoiceUpdated = false;
    mockPrisma.approval.findUnique = async () => ({
      id: 'appr-1',
      targetId: 'inv-1',
      targetType: 'invoice',
      clientName: 'Client Corp',
      status: 'Pending Approval'
    });
    mockPrisma.approval.update = async (args: any) => ({
      id: 'appr-1',
      ...args.data
    });
    mockPrisma.invoice.update = async (args: any) => {
      if (args.where.id === 'inv-1' && args.data.status === 'Paid') {
        invoiceUpdated = true;
      }
      return { id: 'inv-1' };
    };

    const { req, res, next, getResults } = createMockRequestResponse(
      { status: 'Approved', notes: 'Verified' },
      { id: 'appr-1' },
      {}, {}, adminUser
    );
    await verifyApproval(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.status !== 'Approved' || !invoiceUpdated) {
      throw new Error('Failed to approve and cascade state to invoice.');
    }
  });

  await testCase('Personnel: Create personnel profile', async () => {
    const pData = { name: 'John Doe', role: 'Photographer', rate: 150.00 };
    const { req, res, next, getResults } = createMockRequestResponse(pData, {}, {}, {}, adminUser);
    await createPersonnel(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.name !== 'John Doe') {
      throw new Error('Failed to add personnel to registry.');
    }
  });

  await testCase('Templates: Create and get agreement templates', async () => {
    const tData = { title: 'NDA', body: 'Confidentiality agreement.', version: 1 };
    const { req, res, next, getResults } = createMockRequestResponse(tData, {}, {}, {}, adminUser);
    await createAgreementTemplate(req, res, next);
    const { responseData } = getResults();
    if (!responseData || responseData.title !== 'NDA') {
      throw new Error('Failed to create agreement template.');
    }
  });

  await testCase('Projects: Progression of stage (auto-tasks & timeline events)', async () => {
    mockPrisma.project.findFirst = async () => ({
      id: 'proj-1',
      name: 'Project 1',
      stage: 'Booked',
      clientId: 'client-1',
      client: { email: 'client@apco.com', companyName: 'Client Corp' }
    });

    let projectUpdated = false;
    let eventLogged = false;
    let tasksCreated: any[] = [];

    mockPrisma.project.update = async (args: any) => {
      if (args.where.id === 'proj-1' && args.data.stage === 'Team Assigned') {
        projectUpdated = true;
      }
      return { id: 'proj-1', stage: 'Team Assigned' };
    };

    mockPrisma.workflowEvent.create = async (args: any) => {
      if (args.data.projectId === 'proj-1' && args.data.eventType === 'STAGE_ADVANCED') {
        eventLogged = true;
      }
      return { id: 'evt-1' };
    };

    mockPrisma.task.create = async (args: any) => {
      tasksCreated.push(args.data);
      return { id: `task-${tasksCreated.length}`, ...args.data };
    };

    mockPrisma.user.findUnique = async () => null; // skip notification for simplicity

    const { req, res, next, getResults } = createMockRequestResponse(
      { stage: 'Team Assigned', reason: 'Team selected' },
      { id: 'proj-1' },
      {}, {}, adminUser
    );
    await updateProjectStage(req, res, next);
    const { responseData } = getResults();

    if (!responseData || !projectUpdated || !eventLogged || tasksCreated.length !== 1) {
      throw new Error('Project stage progression, transaction logic or auto-task creation failed.');
    }

    if (tasksCreated[0].title !== 'Confirm Shoot Schedule (Project 1)') {
      throw new Error('Auto-provisioned task title is incorrect.');
    }

    if (tasksCreated[0].assignee !== 'Unassigned' || tasksCreated[0].assignedUserId !== null) {
      throw new Error('Assigned user should be unassigned when no staff assignments exist.');
    }
  });

  await testCase('Projects: Progression of stage (auto-tasks assigned to staff based on roles)', async () => {
    mockPrisma.project.findFirst = async () => ({
      id: 'proj-1',
      name: 'Project 1',
      stage: 'Booked',
      clientId: 'client-1',
      client: { email: 'client@apco.com', companyName: 'Client Corp' }
    });

    mockPrisma.staffAssignment.findMany = async (args: any) => {
      if (args.where.projectId === 'proj-1') {
        return [
          {
            id: 'sa-1',
            projectId: 'proj-1',
            userId: 'user-photographer',
            role: 'Photographer',
            user: { id: 'user-photographer', firstName: 'Alice', lastName: 'Snap' }
          },
          {
            id: 'sa-2',
            projectId: 'proj-1',
            userId: 'user-editor',
            role: 'Editor',
            user: { id: 'user-editor', firstName: 'Bob', lastName: 'Cut' }
          }
        ];
      }
      return [];
    };

    let tasksCreated: any[] = [];
    mockPrisma.task.create = async (args: any) => {
      tasksCreated.push(args.data);
      return { id: `task-${tasksCreated.length}`, ...args.data };
    };

    mockPrisma.project.update = async () => ({ id: 'proj-1', stage: 'Team Assigned' });
    mockPrisma.workflowEvent.create = async () => ({ id: 'evt-1' });
    mockPrisma.user.findUnique = async () => null;

    const { req, res, next } = createMockRequestResponse(
      { stage: 'Team Assigned', reason: 'Team selected' },
      { id: 'proj-1' },
      {}, {}, adminUser
    );
    await updateProjectStage(req, res, next);
    
    if (tasksCreated.length !== 1) {
      throw new Error('Expected 1 auto-task to be created.');
    }
    if (tasksCreated[0].assignedUserId !== 'user-photographer' || tasksCreated[0].assignee !== 'Alice Snap') {
      throw new Error('Confirm Shoot Schedule task was not assigned to Photographer.');
    }

    tasksCreated = [];
    mockPrisma.project.update = async () => ({ id: 'proj-1', stage: 'Selection Received' });
    const { req: req2, res: res2, next: next2 } = createMockRequestResponse(
      { stage: 'Selection Received', reason: 'Selections received' },
      { id: 'proj-1' },
      {}, {}, adminUser
    );
    await updateProjectStage(req2, res2, next2);
    
    if (tasksCreated.length !== 1) {
      throw new Error('Expected 1 auto-task to be created for selection stage.');
    }
    if (tasksCreated[0].assignedUserId !== 'user-editor' || tasksCreated[0].assignee !== 'Bob Cut') {
      throw new Error('Start Editing task was not assigned to Editor.');
    }
  });

  // ==========================================
  // Client Auto-Provisioning & Activation Tests
  // ==========================================
  await testCase('Clients: createClient automatically provisions pending Client User', async () => {
    let clientCreated = false;
    let userCreated: any = null;

    mockPrisma.client.findFirst = async () => null; // No duplicate client
    mockPrisma.user.findUnique = async () => null;  // No duplicate user

    mockPrisma.client.create = async (args: any) => {
      clientCreated = true;
      return { id: 'client-new-uuid', ...args.data };
    };

    mockPrisma.user.create = async (args: any) => {
      userCreated = args.data;
      return { id: 'user-new-uuid', ...args.data };
    };

    const { req, res, next, getResults } = createMockRequestResponse(
      { name: 'John Client', email: 'john@client.com', phone: '123456' },
      {}, {}, {}, adminUser
    );

    await createClient(req, res, next);
    const { statusCode } = getResults();

    if (statusCode !== 201) {
      throw new Error(`Expected 201 Created, got ${statusCode}`);
    }
    if (!clientCreated || !userCreated) {
      throw new Error('Client and/or User records were not created.');
    }
    if (userCreated.email !== 'john@client.com' || userCreated.role !== Role.Client) {
      throw new Error('User record contains invalid values.');
    }
    if (userCreated.status !== 'Pending Activation' || !userCreated.setupToken || userCreated.passwordHash !== null) {
      throw new Error('User record was not created in Pending Activation status with null password.');
    }
    if (userCreated.linkedClientId !== 'client-new-uuid') {
      throw new Error('User record is not linked to the client ID.');
    }
  });

  await testCase('Clients: updateClient synchronizes Client User name/email', async () => {
    let clientUpdated = false;
    let userUpdates: any[] = [];

    mockPrisma.client.findFirst = async () => ({ id: 'client-uuid-1', name: 'John Client', email: 'john@client.com' });
    mockPrisma.client.update = async (args: any) => {
      clientUpdated = true;
      return { id: 'client-uuid-1', ...args.data };
    };

    mockPrisma.user.updateMany = async (args: any) => {
      userUpdates.push(args);
      return { count: 1 };
    };

    const { req, res, next, getResults } = createMockRequestResponse(
      { name: 'John Updated', email: 'john-updated@client.com' },
      { id: 'client-uuid-1' },
      {}, {}, adminUser
    );

    await updateClient(req, res, next);
    const { statusCode } = getResults();

    if (statusCode !== 200) {
      throw new Error(`Expected 200 OK, got ${statusCode}`);
    }
    if (!clientUpdated) {
      throw new Error('Client record was not updated.');
    }
    if (userUpdates.length === 0) {
      throw new Error('User records were not updated.');
    }
    const updateArg = userUpdates[0];
    if (updateArg.data.email !== 'john-updated@client.com' || updateArg.data.firstName !== 'John' || updateArg.data.lastName !== 'Updated') {
      throw new Error('User update payload is incorrect.');
    }
  });

  await testCase('Clients: deleteClient locks User account and revokes tokens', async () => {
    let clientDeleted = false;
    let userLocked = false;
    let tokensRevoked = false;
    let sessionsDeleted = false;

    mockPrisma.client.findFirst = async () => ({ id: 'client-uuid-1', name: 'John Client', email: 'john@client.com' });
    mockPrisma.client.update = async () => {
      clientDeleted = true;
      return {};
    };
    mockPrisma.user.findFirst = async () => ({ id: 'user-uuid-1', email: 'john@client.com', role: Role.Client });
    mockPrisma.user.update = async (args: any) => {
      if (args.where.id === 'user-uuid-1' && args.data.lockedUntil && args.data.status === 'Inactive') {
        userLocked = true;
      }
      return {};
    };
    mockPrisma.refreshToken.updateMany = async (args: any) => {
      if (args.where.userId === 'user-uuid-1' && args.data.isRevoked) {
        tokensRevoked = true;
      }
      return { count: 1 };
    };
    mockPrisma.userSession.deleteMany = async (args: any) => {
      if (args.where.userId === 'user-uuid-1') {
        sessionsDeleted = true;
      }
      return { count: 1 };
    };

    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { id: 'client-uuid-1' }, {}, {}, adminUser
    );

    await deleteClient(req, res, next);
    const { statusCode } = getResults();

    if (statusCode !== 200) {
      throw new Error(`Expected 200 OK, got ${statusCode}`);
    }
    if (!clientDeleted) {
      throw new Error('Client record was not soft-deleted.');
    }
    if (!userLocked || !tokensRevoked || !sessionsDeleted) {
      throw new Error('Corresponding User record lock or token/session revocation failed.');
    }
  });

  await testCase('Auth: activateClient activates pending Client User', async () => {
    let userUpdated = false;
    let updatedData: any = null;

    mockPrisma.user.findFirst = async () => ({
      id: 'user-uuid-1',
      email: 'john@client.com',
      role: Role.Client,
      status: 'Pending Activation',
      setupToken: 'valid-setup-token',
    });

    mockPrisma.user.update = async (args: any) => {
      userUpdated = true;
      updatedData = args.data;
      return {};
    };

    const { req, res, next, getResults } = createMockRequestResponse({
      token: 'valid-setup-token',
      password: 'NewPassword123!',
    });

    await activateClient(req, res, next);
    const { statusCode } = getResults();

    if (statusCode !== 200) {
      throw new Error(`Expected 200 OK, got ${statusCode}`);
    }
    if (!userUpdated || !updatedData) {
      throw new Error('User was not updated on activation.');
    }
    if (updatedData.status !== 'Active' || updatedData.setupToken !== null || !updatedData.passwordHash) {
      throw new Error('Activation failed to set Active status, clear setupToken, or generate passwordHash.');
    }
  });

  // ==========================================
  // Event Module Tests
  // ==========================================
  await testCase('Events: getEvents for Admin/Manager lists all events', async () => {
    mockPrisma.event.findMany = async (args: any) => {
      if (args && args.orderBy && args.orderBy.date === 'asc') {
        return [{ id: 'event-1', name: 'Event A', date: new Date() }];
      }
      return [];
    };

    const { req, res, next, getResults } = createMockRequestResponse({}, {}, {}, {}, adminUser);
    await getEvents(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200 || responseData.length !== 1 || responseData[0].id !== 'event-1') {
      throw new Error('Failed to retrieve all events as Admin/Manager.');
    }
  });

  await testCase('Events: getEvents for Client lists only client-specific events', async () => {
    mockPrisma.client.findFirst = async () => ({ id: 'client-rec-id' });
    mockPrisma.event.findMany = async (args: any) => {
      if (args && args.where && args.where.clientId === 'client-rec-id') {
        return [{ id: 'client-event-1', name: 'Client Event', clientId: 'client-rec-id' }];
      }
      return [];
    };

    const { req, res, next, getResults } = createMockRequestResponse({}, {}, {}, {}, clientUser);
    await getEvents(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200 || responseData.length !== 1 || responseData[0].id !== 'client-event-1') {
      throw new Error('Failed to retrieve client-specific events.');
    }
  });

  await testCase('Events: createEvent creates event and logs EVENT_CREATE for Admin/Manager', async () => {
    let auditLogged = false;
    mockPrisma.event.create = async (args: any) => ({ id: 'event-new', ...args.data });
    mockPrisma.auditLog.create = async (args: any) => {
      if (args.data.action === 'EVENT_CREATE' && args.data.userId === adminUser.id) {
        auditLogged = true;
      }
      return {};
    };

    const eventPayload = {
      id: 'event-new',
      clientId: 'client-rec-id',
      name: 'Wedding Ceremony',
      date: '2026-06-20T10:00:00.000Z',
      startTime: '10:00',
      endTime: '12:00',
      venueLocation: 'Grand Ballroom'
    };

    const { req, res, next, getResults } = createMockRequestResponse(eventPayload, {}, {}, {}, adminUser);
    await createEvent(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 201 || responseData.id !== 'event-new' || !auditLogged) {
      throw new Error('Failed to create event or log audit log as admin.');
    }
  });

  await testCase('Events: createEvent blocks non-admin/manager roles (403)', async () => {
    const { req, res, next, getResults } = createMockRequestResponse(
      { clientId: 'client-rec-id', name: 'Shoot', date: '2026-06-20' },
      {}, {}, {}, photographerUser
    );

    await createEvent(req, res, next);
    const { nextError } = getResults();

    if (!nextError || nextError.statusCode !== 403) {
      throw new Error('Expected 403 AppError for unauthorized role on event creation.');
    }
  });

  await testCase('Events: updateEvent updates event and logs EVENT_UPDATE for Admin/Manager', async () => {
    let auditLogged = false;
    mockPrisma.event.findUnique = async () => ({ id: 'event-update-id', name: 'Original Shoot', date: new Date() });
    mockPrisma.event.update = async (args: any) => ({ id: 'event-update-id', ...args.data });
    mockPrisma.auditLog.create = async (args: any) => {
      if (args.data.action === 'EVENT_UPDATE' && args.data.userId === adminUser.id) {
        auditLogged = true;
      }
      return {};
    };

    const { req, res, next, getResults } = createMockRequestResponse(
      { name: 'Updated Shoot', progress: 50 },
      { id: 'event-update-id' },
      {}, {}, adminUser
    );

    await updateEvent(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200 || responseData.name !== 'Updated Shoot' || responseData.progress !== 50 || !auditLogged) {
      throw new Error('Failed to update event or log audit log.');
    }
  });

  await testCase('Events: updateEvent blocks non-admin/manager roles (403)', async () => {
    const { req, res, next, getResults } = createMockRequestResponse(
      { name: 'Hack' },
      { id: 'event-update-id' },
      {}, {}, photographerUser
    );

    await updateEvent(req, res, next);
    const { nextError } = getResults();

    if (!nextError || nextError.statusCode !== 403) {
      throw new Error('Expected 403 AppError for unauthorized role on event update.');
    }
  });

  await testCase('Events: deleteEvent deletes event and logs EVENT_DELETE for Admin/Manager', async () => {
    let auditLogged = false;
    let eventDeleted = false;

    mockPrisma.event.findUnique = async () => ({ id: 'event-del-id', name: 'Shoot to delete' });
    mockPrisma.event.delete = async (args: any) => {
      if (args.where.id === 'event-del-id') {
        eventDeleted = true;
      }
      return {};
    };
    mockPrisma.auditLog.create = async (args: any) => {
      if (args.data.action === 'EVENT_DELETE' && args.data.userId === adminUser.id) {
        auditLogged = true;
      }
      return {};
    };

    const { req, res, next, getResults } = createMockRequestResponse({}, { id: 'event-del-id' }, {}, {}, adminUser);
    await deleteEvent(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200 || !eventDeleted || !auditLogged || responseData.message !== 'Event deleted successfully.') {
      throw new Error('Failed to delete event or log audit log.');
    }
  });

  await testCase('Events: deleteEvent blocks non-admin/manager roles (403)', async () => {
    const { req, res, next, getResults } = createMockRequestResponse(
      {}, { id: 'event-del-id' }, {}, {}, photographerUser
    );

    await deleteEvent(req, res, next);
    const { nextError } = getResults();

    if (!nextError || nextError.statusCode !== 403) {
      throw new Error('Expected 403 AppError for unauthorized role on event deletion.');
    }
  });

  await testCase('Events: client creation synchronizes events', async () => {
    let eventCreateManyPayload: any = null;
    mockPrisma.client.findFirst = async () => null; // No duplicate client
    mockPrisma.user.findUnique = async () => null;  // No duplicate user
    mockPrisma.client.create = async (args: any) => ({ id: 'client-with-events-id', ...args.data });
    mockPrisma.user.create = async () => ({ id: 'user-uuid' });
    mockPrisma.event.createMany = async (args: any) => {
      eventCreateManyPayload = args.data;
      return { count: args.data.length };
    };

    const clientPayload = {
      name: 'Jane Doe',
      email: 'jane@doe.com',
      phone: '999999',
      events: [
        {
          id: 'event-custom-1',
          name: 'Reception',
          date: '2026-06-25T18:00:00.000Z',
          startTime: '18:00',
          endTime: '22:00',
          progress: 10,
          status: 'Scheduled'
        }
      ]
    };

    const { req, res, next, getResults } = createMockRequestResponse(clientPayload, {}, {}, {}, adminUser);
    await createClient(req, res, next);
    const { statusCode } = getResults();

    if (statusCode !== 201) {
      throw new Error(`Expected 201 Created, got ${statusCode}`);
    }
    if (!eventCreateManyPayload || eventCreateManyPayload.length !== 1) {
      throw new Error('Events were not synchronized during client creation.');
    }
    const ev = eventCreateManyPayload[0];
    if (ev.id !== 'event-custom-1' || ev.clientId !== 'client-with-events-id' || ev.name !== 'Reception' || ev.progress !== 10) {
      throw new Error('Event synchronization payload contains incorrect fields.');
    }
  });

  await testCase('Events: client update synchronizes events', async () => {
    let eventDeletedMany = false;
    let eventCreateManyPayload: any = null;

    mockPrisma.client.findFirst = async () => ({ id: 'client-update-events-id', name: 'Jane Doe', email: 'jane@doe.com' });
    mockPrisma.client.update = async (args: any) => ({ id: 'client-update-events-id', ...args.data });
    mockPrisma.user.updateMany = async () => ({ count: 1 });
    mockPrisma.event.deleteMany = async (args: any) => {
      if (args.where.clientId === 'client-update-events-id') {
        eventDeletedMany = true;
      }
      return { count: 1 };
    };
    mockPrisma.event.createMany = async (args: any) => {
      eventCreateManyPayload = args.data;
      return { count: args.data.length };
    };

    const clientPayload = {
      name: 'Jane Updated',
      events: [
        {
          id: 'event-custom-2',
          name: 'Engagement',
          date: '2026-07-05T10:00:00.000Z',
          startTime: '10:00',
          endTime: '12:00',
          status: 'Completed'
        }
      ]
    };

    const { req, res, next, getResults } = createMockRequestResponse(clientPayload, { id: 'client-update-events-id' }, {}, {}, adminUser);
    await updateClient(req, res, next);
    const { statusCode } = getResults();

    if (statusCode !== 200) {
      throw new Error(`Expected 200 OK, got ${statusCode}`);
    }
    if (!eventDeletedMany) {
      throw new Error('Existing events were not deleted before syncing new ones.');
    }
    if (!eventCreateManyPayload || eventCreateManyPayload.length !== 1) {
      throw new Error('New events were not synchronized during client update.');
    }
    const ev = eventCreateManyPayload[0];
    if (ev.id !== 'event-custom-2' || ev.clientId !== 'client-update-events-id' || ev.name !== 'Engagement' || ev.status !== 'Completed') {
      throw new Error('Event synchronization update payload contains incorrect fields.');
    }
  });

  await testCase('Tasks: updateTask permissions check', async () => {
    // 1. Admin can update task status
    const mockTask = {
      id: 'task-123',
      title: 'Coordination Task',
      assignedUserId: 'assigned-user-id',
      projectId: 'project-123',
      status: 'Pending',
    };
    mockPrisma.task.findUnique = async () => mockTask;
    mockPrisma.task.update = async (args: any) => ({ ...mockTask, status: args.data.status });
    
    const { req: reqAdmin, res: resAdmin, next: nextAdmin, getResults: resultsAdmin } = createMockRequestResponse(
      { status: 'Completed' },
      { id: 'task-123' },
      {}, {}, adminUser
    );
    await updateTask(reqAdmin, resAdmin, nextAdmin);
    if (resultsAdmin().nextError) throw resultsAdmin().nextError;
    if (!resultsAdmin().responseData || resultsAdmin().responseData.status !== 'Completed') {
      throw new Error('Admin failed to update task status.');
    }

    // 2. Manager can update task status
    const { req: reqManager, res: resManager, next: nextManager, getResults: resultsManager } = createMockRequestResponse(
      { status: 'In Progress' },
      { id: 'task-123' },
      {}, {}, managerUser
    );
    await updateTask(reqManager, resManager, nextManager);
    if (resultsManager().nextError) throw resultsManager().nextError;
    if (!resultsManager().responseData || resultsManager().responseData.status !== 'In Progress') {
      throw new Error('Manager failed to update task status.');
    }

    // 3. Direct task assignee can update task status
    const assignedStaffUser = { id: 'assigned-user-id', role: Role.Photographer };
    const { req: reqAssignee, res: resAssignee, next: nextAssignee, getResults: resultsAssignee } = createMockRequestResponse(
      { status: 'Completed' },
      { id: 'task-123' },
      {}, {}, assignedStaffUser
    );
    await updateTask(reqAssignee, resAssignee, nextAssignee);
    if (resultsAssignee().nextError) throw resultsAssignee().nextError;
    if (!resultsAssignee().responseData || resultsAssignee().responseData.status !== 'Completed') {
      throw new Error('Direct task assignee failed to update task status.');
    }

    // 4. Staff member assigned to the project can update task status
    mockPrisma.staffAssignment.findFirst = async (args: any) => {
      if (args.where.userId === 'project-staff-id' && args.where.projectId === 'project-123') {
        return { id: 'assign-123' };
      }
      return null;
    };
    const projectStaffUser = { id: 'project-staff-id', role: Role.Videographer };
    const { req: reqProjStaff, res: resProjStaff, next: nextProjStaff, getResults: resultsProjStaff } = createMockRequestResponse(
      { status: 'In Progress' },
      { id: 'task-123' },
      {}, {}, projectStaffUser
    );
    await updateTask(reqProjStaff, resProjStaff, nextProjStaff);
    if (resultsProjStaff().nextError) throw resultsProjStaff().nextError;
    if (!resultsProjStaff().responseData || resultsProjStaff().responseData.status !== 'In Progress') {
      throw new Error('Project staff member failed to update task status.');
    }

    // 5. Unrelated staff member receives 403
    const unrelatedStaffUser = { id: 'unrelated-staff-id', role: Role.Editor };
    const { req: reqUnrelated, res: resUnrelated, next: nextUnrelated, getResults: resultsUnrelated } = createMockRequestResponse(
      { status: 'Completed' },
      { id: 'task-123' },
      {}, {}, unrelatedStaffUser
    );
    await updateTask(reqUnrelated, resUnrelated, nextUnrelated);
    if (!resultsUnrelated().nextError || resultsUnrelated().nextError.statusCode !== 403) {
      throw new Error('Unrelated staff user was not denied update access (expected 403).');
    }

    // 6. Client user receives 403
    const { req: reqClient, res: resClient, next: nextClient, getResults: resultsClient } = createMockRequestResponse(
      { status: 'Completed' },
      { id: 'task-123' },
      {}, {}, clientUser
    );
    await updateTask(reqClient, resClient, nextClient);
    if (!resultsClient().nextError || resultsClient().nextError.statusCode !== 403) {
      throw new Error('Client user was not denied update access (expected 403).');
    }
  });

  await testCase('Staff Assignments: Team Assignment Event Mapping & Task Synchronization', async () => {
    let createdAssignment: any = null;
    let updatedAssignment: any = null;
    let createdTasks: any[] = [];
    let updatedTasks: any[] = [];

    mockPrisma.project.findFirst = async () => ({
      ...mockProjectRecord,
      client: { companyName: 'Artisans' }
    });
    mockPrisma.user.findUnique = async () => photographerUser;
    
    // Simulate first assignment (no existing record)
    let existingAssignment: any = null;
    mockPrisma.staffAssignment.findFirst = async () => existingAssignment;
    mockPrisma.staffAssignment.create = async (args: any) => {
      createdAssignment = { id: 'assign-123', ...args.data };
      return createdAssignment;
    };
    
    mockPrisma.event.findFirst = async (args: any) => {
      return { id: args.where.id, name: 'Save The Date', date: new Date() };
    };
    
    mockPrisma.task.findFirst = async (args: any) => {
      if (args && args.where) {
        const { projectId, eventId } = args.where;
        return [...createdTasks, ...updatedTasks].find(t => t.projectId === projectId && t.eventId === eventId) || null;
      }
      return null;
    };
    mockPrisma.task.create = async (args: any) => {
      createdTasks.push({ id: `task-${createdTasks.length + 1}`, ...args.data });
      return createdTasks[createdTasks.length - 1];
    };
    mockPrisma.task.findMany = async () => createdTasks;
    mockPrisma.staffAssignment.findMany = async () => [createdAssignment];

    // Request 1: Assign user to "Save The Date"
    const { req: req1, res: res1, next: next1, getResults: results1 } = createMockRequestResponse(
      { userId: photographerUser.id, role: Role.Photographer, eventId: 'event-save-the-date' },
      { id: 'project-uuid' },
      {}, {}, adminUser
    );

    await assignStaff(req1, res1, next1);
    if (results1().nextError) throw results1().nextError;
    if (results1().statusCode !== 201) {
      throw new Error(`Expected 201, got ${results1().statusCode}`);
    }

    if (!createdAssignment || !createdAssignment.eventIds.includes('event-save-the-date')) {
      throw new Error('First eventId was not assigned properly.');
    }
    
    if ((createdTasks.length as number) !== 1 || !createdTasks[0].title.startsWith('Coordination for Save The Date')) {
      throw new Error('Coordination task for first event was not generated.');
    }

    if (createdTasks[0].assignedUserId !== photographerUser.id) {
      throw new Error('Coordination task was not assigned to the photographer.');
    }

    // Now test reuse logic: assign to another event (Engagement)
    existingAssignment = createdAssignment;
    mockPrisma.staffAssignment.update = async (args: any) => {
      updatedAssignment = { ...existingAssignment, ...args.data };
      return updatedAssignment;
    };
    mockPrisma.event.findFirst = async (args: any) => {
      return { id: args.where.id, name: 'Engagement', date: new Date() };
    };
    
    // For findMany tasks, let's return the existing task + any newly created ones
    mockPrisma.task.findMany = async () => [...createdTasks, ...updatedTasks];
    mockPrisma.staffAssignment.findMany = async () => [updatedAssignment];
    mockPrisma.task.update = async (args: any) => {
      const task = [...createdTasks, ...updatedTasks].find(t => t.id === args.where.id);
      if (task) {
        Object.assign(task, args.data);
      }
      return task;
    };

    // Request 2: Assign same user to "Engagement"
    const { req: req2, res: res2, next: next2, getResults: results2 } = createMockRequestResponse(
      { userId: photographerUser.id, role: Role.Photographer, eventId: 'event-engagement' },
      { id: 'project-uuid' },
      {}, {}, adminUser
    );

    await assignStaff(req2, res2, next2);
    if (results2().nextError) throw results2().nextError;

    if (!updatedAssignment || !updatedAssignment.eventIds.includes('event-engagement')) {
      throw new Error('Existing assignment was not reused or eventId not appended.');
    }

    if (updatedAssignment.eventIds.length !== 2) {
      throw new Error('Expected 2 assigned events on reuse.');
    }

    // We should have a second coordination task created (Engagement)
    if ((createdTasks.length as number) !== 2) {
      throw new Error(`Expected 2 coordination tasks created, got ${createdTasks.length}`);
    }

    const engagementTask = createdTasks.find(t => t.title.startsWith('Coordination for Engagement'));
    if (!engagementTask) {
      throw new Error('Coordination task for Engagement event was not generated.');
    }

    if (engagementTask.assignedUserId !== photographerUser.id) {
      throw new Error('Coordination task for Engagement was not automatically assigned.');
    }
  });

  console.log('\n📊 Comprehensive Integration Tests Summary:');
  console.log(`   Passed: ${passedCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log('------------------------------');

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Allow direct execution
if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  });
}

export { runTests };
