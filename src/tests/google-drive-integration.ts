import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { 
  authenticateDrive, 
  createFolder, 
  uploadFile, 
  deleteFile 
} from '../services/google-drive.service';
import { 
  uploadProjectFile, 
  downloadProjectFile, 
  getFilesByProject,
  deleteProjectFile 
} from '../modules/files/google-drive.controller';

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
      // Mock setHeader
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
  console.log('\n🧪 Starting APCO Google Drive Storage Integration Tests...\n');
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

  // ==============================================================
  // 1. Live Google Drive Service Check (if keys are configured)
  // ==============================================================
  console.log('🌐 Executing Live API Credentials & Access Verification...');
  try {
    await authenticateDrive();
    console.log('   ✅ [SUCCESS] Google Drive Service Account authenticated successfully.');
    
    // Attempt folder create/delete sanity check
    const tempFolderId = await createFolder(`APCO-Test-${Date.now()}`, env.GOOGLE_DRIVE_FOLDER_ID);
    console.log(`   ✅ [SUCCESS] Client Folder provisioning authenticated.`);
    
    const testFile = await uploadFile(
      Buffer.from('APCO Integration Test File'),
      'apco-test.txt',
      'text/plain',
      tempFolderId
    );
    console.log(`   ✅ [SUCCESS] Google Drive File uploading validated.`);
    
    await deleteFile(testFile.id);
    await deleteFile(tempFolderId);
    console.log('   ✅ [SUCCESS] Test sandbox folders cleaned up successfully.');
  } catch (err: any) {
    console.warn(`   ⚠️  Live API test skipped or credentials incomplete: ${err.message}`);
  }

  console.log('\n⚙️ Executing Mock Controller Validation...');

  // Save original model interfaces
  const mockPrisma = prisma as any;
  const originalFile = mockPrisma.file;
  const originalProject = mockPrisma.project;
  const originalAuditLog = mockPrisma.auditLog;
  const originalWorkflowEvent = mockPrisma.workflowEvent;
  const originalStaffAssignment = mockPrisma.staffAssignment;

  // Set up mock implementations
  mockPrisma.auditLog = {
    create: async () => ({})
  };
  mockPrisma.workflowEvent = {
    create: async () => ({})
  };

  const testAdminUser = { id: 'admin-1', email: 'admin@apco.com', role: Role.SystemAdmin };
  const testPhotographer = { id: 'photo-1', email: 'photo@apco.com', role: Role.Photographer };
  const testClientUser = { id: 'client-1', email: 'client@apco.com', role: Role.Client };

  const mockProject = {
    id: 'project-1',
    name: 'Wedding Project',
    clientId: 'client-rec-1',
    driveFolderId: 'folder-root',
    galleryFolderId: 'folder-gallery',
    deliverablesFolderId: 'folder-deliv',
    client: { id: 'client-rec-1', name: 'Joel', email: 'client@apco.com' }
  };

  mockPrisma.project = {
    findFirst: async () => mockProject,
    findUnique: async () => mockProject
  };

  // 2. Upload Endpoint Tests
  await testCase('Upload: Unassigned photographer is blocked (403)', async () => {
    mockPrisma.staffAssignment = {
      findFirst: async () => null // Not assigned
    };

    const mockFile = {
      buffer: Buffer.from('dummy content'),
      originalname: 'pic.jpg',
      mimetype: 'image/jpeg',
      size: 2048
    };

    const { req, res, next, results } = mockRequestResponse(
      { projectId: 'project-1', folderType: 'Gallery' },
      {}, {}, mockFile, testPhotographer
    );

    await uploadProjectFile(req, res, next);
    const { nextError } = results();

    if (!nextError || nextError.statusCode !== 403) {
      throw new Error('Expected 403 AppError for unassigned staff.');
    }
  });

  await testCase('Upload: SystemAdmin can upload to any project', async () => {
    let workflowLogged = false;
    let auditLogged = false;

    mockPrisma.file = {
      create: async (args: any) => {
        return { id: 'new-file-uuid', createdAt: new Date(), ...args.data };
      }
    };
    mockPrisma.workflowEvent = {
      create: async () => {
        workflowLogged = true;
        return {};
      }
    };
    mockPrisma.auditLog = {
      create: async () => {
        auditLogged = true;
        return {};
      }
    };

    const mockFile = {
      buffer: Buffer.from('sample image content'),
      originalname: 'portrait.jpg',
      mimetype: 'image/jpeg',
      size: 512
    };

    const { req, res, next, results } = mockRequestResponse(
      { projectId: 'project-1', folderType: 'Gallery', isSecured: 'false' },
      {}, {}, mockFile, testAdminUser
    );

    // Mock Google Drive upload to bypass real API
    const googleDriveService = require('../services/google-drive.service');
    const originalUpload = googleDriveService.uploadFile;
    googleDriveService.uploadFile = async () => ({
      id: 'drive-uploaded-id',
      name: 'portrait.jpg',
      mimeType: 'image/jpeg',
      webViewLink: 'https://drive.google.com/test/view'
    });

    try {
      await uploadProjectFile(req, res, next);
      const { statusCode, responseData } = results();

      if (statusCode !== 201 || !responseData.id) {
        throw new Error('Expected 201 success response with file data.');
      }
      if (!workflowLogged || !auditLogged) {
        throw new Error('Expected workflow event and audit trail log entries to be created.');
      }
    } finally {
      googleDriveService.uploadFile = originalUpload;
    }
  });

  // 3. Download Endpoint Tests
  await testCase('Download: Client can download their project files', async () => {
    mockPrisma.file = {
      findFirst: async () => ({
        id: 'file-1',
        projectId: 'project-1',
        googleDriveFileId: 'drive-file-123',
        mimeType: 'image/jpeg',
        originalName: 'pic.jpg',
        userId: 'admin-1'
      })
    };

    const { req, res, next } = mockRequestResponse(
      {}, { id: 'file-1' }, {}, undefined, testClientUser
    );

    // Mock downloadFileStream
    const googleDriveService = require('../services/google-drive.service');
    const originalDownload = googleDriveService.downloadFileStream;
    let streamPiped = false;
    googleDriveService.downloadFileStream = async () => ({
      pipe: (_response: any) => {
        streamPiped = true;
      }
    });

    try {
      await downloadProjectFile(req, res, next);
      if (!streamPiped) {
        throw new Error('Expected download stream to be piped to the response.');
      }
    } finally {
      googleDriveService.downloadFileStream = originalDownload;
    }
  });

  // 4. Delete Endpoint Tests
  await testCase('Delete: Staff cannot delete admin uploaded files', async () => {
    mockPrisma.file = {
      findFirst: async () => ({
        id: 'file-1',
        projectId: 'project-1',
        googleDriveFileId: 'drive-file-123',
        userId: 'admin-1'
      })
    };

    const { req, res, next, results } = mockRequestResponse(
      {}, { id: 'file-1' }, {}, undefined, testPhotographer
    );

    await deleteProjectFile(req, res, next);
    const { nextError } = results();

    if (!nextError || nextError.statusCode !== 403) {
      throw new Error('Expected 403 permission block for staff file deletion.');
    }
  });

  // ==========================================
  // APCO Phase 4 Integration Tests
  // ==========================================
  const originalUser = mockPrisma.user;
  const originalNotification = mockPrisma.notification;

  await testCase('Upload Category: Saves category and notifies client on staff upload', async () => {
    let createdFileData: any = null;
    let notificationsCreated: any[] = [];

    mockPrisma.file = {
      create: async (args: any) => {
        createdFileData = args.data;
        return { id: 'file-uploaded-uuid', createdAt: new Date(), ...args.data };
      }
    };
    mockPrisma.notification = {
      create: async (args: any) => {
        notificationsCreated.push(args.data);
        return { id: 'notif-1', ...args.data };
      }
    };
    mockPrisma.user = {
      findFirst: async (args: any) => {
        if (args.where && args.where.email === 'client@apco.com') {
          return { id: 'client-user-1', email: 'client@apco.com', role: Role.Client };
        }
        return null;
      }
    };
    mockPrisma.project = {
      findFirst: async () => ({
        id: 'project-1',
        name: 'Wedding Event',
        clientId: 'client-rec-1',
        driveFolderId: 'folder-root',
        galleryFolderId: 'folder-gallery',
        client: { id: 'client-rec-1', name: 'Joel', email: 'client@apco.com' }
      }),
      findUnique: async () => ({
        id: 'project-1',
        name: 'Wedding Event',
        clientId: 'client-rec-1',
        client: { id: 'client-rec-1', name: 'Joel', email: 'client@apco.com' }
      })
    };
    mockPrisma.staffAssignment = {
      findFirst: async () => ({ id: 'assign-1' })
    };

    const mockFile = {
      buffer: Buffer.from('sample image content'),
      originalname: 'portrait.jpg',
      mimetype: 'image/jpeg',
      size: 512
    };

    const { req, res, next, results } = mockRequestResponse(
      { projectId: 'project-1', folderType: 'Gallery', isSecured: 'false' },
      {}, {}, mockFile, testPhotographer
    );

    const googleDriveService = require('../services/google-drive.service');
    const originalUpload = googleDriveService.uploadFile;
    googleDriveService.uploadFile = async () => ({
      id: 'drive-uploaded-id',
      name: 'portrait.jpg',
      mimeType: 'image/jpeg',
      webViewLink: 'https://drive.google.com/test/view'
    });

    try {
      await uploadProjectFile(req, res, next);
      const { statusCode } = results();

      if (statusCode !== 201) {
        throw new Error(`Expected 201 status code, got ${statusCode}`);
      }

      if (!createdFileData || createdFileData.category !== 'Gallery') {
        throw new Error(`Expected file category to be 'Gallery', got ${createdFileData?.category}`);
      }

      if (notificationsCreated.length !== 1) {
        throw new Error(`Expected 1 notification created, got ${notificationsCreated.length}`);
      }

      const notif = notificationsCreated[0];
      if (notif.userId !== 'client-user-1' || notif.title !== 'New Gallery Photos Available') {
        throw new Error(`Invalid notification: ${JSON.stringify(notif)}`);
      }
      if (!notif.message.includes('Wedding Event')) {
        throw new Error(`Notification message doesn't contain project name: ${notif.message}`);
      }
    } finally {
      googleDriveService.uploadFile = originalUpload;
    }
  });

  await testCase('Upload Notification: Notifies staff/managers on client upload', async () => {
    let notificationsCreated: any[] = [];

    mockPrisma.file = {
      create: async (args: any) => {
        return { id: 'file-uploaded-uuid', createdAt: new Date(), ...args.data };
      }
    };
    mockPrisma.notification = {
      create: async (args: any) => {
        notificationsCreated.push(args.data);
        return { id: 'notif-1', ...args.data };
      }
    };
    mockPrisma.project = {
      findFirst: async () => ({
        id: 'project-1',
        name: 'Wedding Event',
        clientId: 'client-rec-1',
        driveFolderId: 'folder-root',
        galleryFolderId: 'folder-gallery',
        client: { id: 'client-rec-1', name: 'Joel', email: 'client@apco.com' }
      }),
      findUnique: async () => ({
        id: 'project-1',
        name: 'Wedding Event',
        clientId: 'client-rec-1',
        client: { id: 'client-rec-1', name: 'Joel', email: 'client@apco.com' }
      })
    };
    mockPrisma.staffAssignment = {
      findMany: async () => [{ userId: 'staff-user-1' }, { userId: 'staff-user-2' }]
    };
    mockPrisma.user = {
      findMany: async () => [{ id: 'admin-user-1' }],
      findFirst: async () => null
    };

    const mockFile = {
      buffer: Buffer.from('client document text'),
      originalname: 'agreement-signed.pdf',
      mimetype: 'application/pdf',
      size: 1024
    };

    const { req, res, next, results } = mockRequestResponse(
      { projectId: 'project-1', folderType: 'Agreements', isSecured: 'false' },
      {}, {}, mockFile, testClientUser
    );

    const googleDriveService = require('../services/google-drive.service');
    const originalUpload = googleDriveService.uploadFile;
    googleDriveService.uploadFile = async () => ({
      id: 'drive-uploaded-id',
      name: 'agreement-signed.pdf',
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/test/view'
    });

    try {
      await uploadProjectFile(req, res, next);
      const { statusCode } = results();

      if (statusCode !== 201) {
        throw new Error(`Expected 201 status code, got ${statusCode}`);
      }

      // Should notify: staff-user-1, staff-user-2, and admin-user-1
      if (notificationsCreated.length !== 3) {
        throw new Error(`Expected 3 notifications created, got ${notificationsCreated.length}`);
      }

      const userIds = notificationsCreated.map(n => n.userId);
      if (!userIds.includes('staff-user-1') || !userIds.includes('staff-user-2') || !userIds.includes('admin-user-1')) {
        throw new Error(`Notifications did not target correct recipients: ${userIds.join(', ')}`);
      }
    } finally {
      googleDriveService.uploadFile = originalUpload;
    }
  });

  await testCase('List Filtering: Filters by category query param and enforces client restrictions', async () => {
    let findManyWhere: any = null;

    const allFiles = [
      { id: 'f-gal', originalName: 'pic.jpg', mimeType: 'image/jpeg', size: 100, category: 'Gallery', googleDriveFileId: 'd-gal', googleDriveViewLink: 'v-gal', createdAt: new Date() },
      { id: 'f-del', originalName: 'final.mp4', mimeType: 'video/mp4', size: 200, category: 'Deliverables', googleDriveFileId: 'd-del', googleDriveViewLink: 'v-del', createdAt: new Date() },
      { id: 'f-raw', originalName: 'raw.cr2', mimeType: 'image/x-canon-cr2', size: 300, category: 'Raw Uploads', googleDriveFileId: 'd-raw', googleDriveViewLink: 'v-raw', createdAt: new Date() }
    ];

    function applyFilter(files: any[], where: any) {
      if (where.category) {
        if (typeof where.category === 'string') {
          return files.filter(f => f.category === where.category);
        }
        if (where.category.in) {
          return files.filter(f => where.category.in.includes(f.category));
        }
      }
      return files;
    }

    mockPrisma.file = {
      findMany: async (args: any) => {
        findManyWhere = args.where;
        return applyFilter(allFiles, args.where);
      },
      count: async (args: any) => {
        return applyFilter(allFiles, args.where).length;
      }
    };
    mockPrisma.project = {
      findFirst: async () => ({
        id: 'project-1',
        client: { id: 'client-rec-1', email: 'client@apco.com' }
      })
    };

    // Client queries with category=Gallery
    {
      const { req, res, next, results } = mockRequestResponse(
        {}, { projectId: 'project-1' }, { category: 'Gallery' }, undefined, testClientUser
      );
      await getFilesByProject(req, res, next);
      const { statusCode, responseData } = results();

      if (statusCode !== 200) {
        throw new Error(`Expected 200 status code, got ${statusCode}`);
      }
      if (responseData.length !== 1 || responseData[0].id !== 'f-gal') {
        throw new Error(`Expected only gallery file for client query.`);
      }
      if (findManyWhere.category !== 'Gallery') {
        throw new Error(`Expected category filter 'Gallery', got: ${JSON.stringify(findManyWhere.category)}`);
      }
    }

    // Client queries with category=Raw Uploads -> Blocked!
    {
      const { req, res, next, results } = mockRequestResponse(
        {}, { projectId: 'project-1' }, { category: 'Raw Uploads' }, undefined, testClientUser
      );
      await getFilesByProject(req, res, next);
      const { nextError } = results();

      if (!nextError || nextError.statusCode !== 403) {
        throw new Error(`Expected 403 AppError for Client querying Raw Uploads.`);
      }
    }

    // Client queries without category -> Filtered automatically to exclude Raw Uploads
    {
      const { req, res, next, results } = mockRequestResponse(
        {}, { projectId: 'project-1' }, {}, undefined, testClientUser
      );
      await getFilesByProject(req, res, next);
      const { statusCode, responseData } = results();

      if (statusCode !== 200) {
        throw new Error(`Expected 200 status code, got ${statusCode}`);
      }
      if (responseData.length !== 2) {
        throw new Error(`Expected 2 files (Gallery, Deliverables) for client, got ${responseData.length}`);
      }
      const ids = responseData.map((f: any) => f.id);
      if (ids.includes('f-raw')) {
        throw new Error(`Client response contains Raw Uploads!`);
      }
      if (!findManyWhere.category || !findManyWhere.category.in) {
        throw new Error(`Expected category IN array filter for Client query.`);
      }
    }

    // Admin queries with category=Raw Uploads -> Allowed
    {
      const { req, res, next, results } = mockRequestResponse(
        {}, { projectId: 'project-1' }, { category: 'Raw Uploads' }, undefined, testAdminUser
      );
      await getFilesByProject(req, res, next);
      const { statusCode, responseData } = results();

      if (statusCode !== 200) {
        throw new Error(`Expected 200 status code, got ${statusCode}`);
      }
      if (responseData.length !== 1 || responseData[0].id !== 'f-raw') {
        throw new Error(`Expected raw upload file for Admin.`);
      }
    }
  });

  await testCase('Download Block: Clients cannot download Raw Upload files', async () => {
    mockPrisma.file = {
      findFirst: async () => ({
        id: 'file-raw-1',
        projectId: 'project-1',
        googleDriveFileId: 'drive-raw-123',
        mimeType: 'image/x-canon-cr2',
        originalName: 'raw.cr2',
        category: 'Raw Uploads',
        userId: 'admin-1'
      })
    };
    mockPrisma.project = {
      findFirst: async () => ({
        id: 'project-1',
        client: { id: 'client-rec-1', email: 'client@apco.com' }
      })
    };

    const { req, res, next, results } = mockRequestResponse(
      {}, { id: 'file-raw-1' }, {}, undefined, testClientUser
    );

    await downloadProjectFile(req, res, next);
    const { nextError } = results();

    if (!nextError || nextError.statusCode !== 403) {
      throw new Error('Expected 403 AppError for Client attempting to download Raw Upload.');
    }
  });

  // Restore prisma models
  mockPrisma.file = originalFile;
  mockPrisma.project = originalProject;
  mockPrisma.auditLog = originalAuditLog;
  mockPrisma.workflowEvent = originalWorkflowEvent;
  mockPrisma.staffAssignment = originalStaffAssignment;
  mockPrisma.user = originalUser;
  mockPrisma.notification = originalNotification;

  console.log(`\n📊 Google Drive Integration Tests Summary:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);

  if (failed > 0) {
    throw new Error(`${failed} test cases failed in APCO Google Drive Suite.`);
  }
}

if (require.main === module) {
  runTests();
}
