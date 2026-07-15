import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { uploadWebsiteGalleryCover } from '../modules/website-gallery/website-gallery.controller';

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
  console.log('\n🧪 Starting APCO Website Gallery Cover Upload Integration Tests...\n');
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

  // Define mock users
  const adminUser = { id: 'admin-1', email: 'admin@apco.com', role: Role.SystemAdmin };
  const managerUser = { id: 'manager-1', email: 'mgr@apco.com', role: Role.Manager };
  const photographerUser = { id: 'photo-1', email: 'photo@apco.com', role: Role.Photographer };
  const clientUser = { id: 'client-1', email: 'client@apco.com', role: Role.Client };

  // Save original google drive functions to mock
  const googleDriveService = require('../services/google-drive.service');
  const originalGetOrCreateFolder = googleDriveService.getOrCreateFolder;
  const originalUploadFile = googleDriveService.uploadFile;
  const originalGetDriveClient = googleDriveService.getDriveClient;
  const originalDeleteFile = googleDriveService.deleteFile;

  // Set up mock implementations for normal controller validation tests
  const setupMocks = () => {
    googleDriveService.getOrCreateFolder = async (name: string, _parentId: string) => {
      if (name === 'Website Gallery') return 'mock-gallery-root-id';
      if (name === 'Cover Images') return 'mock-cover-images-id';
      return 'mock-folder-id';
    };

    googleDriveService.uploadFile = async (_buffer: Buffer, filename: string, mimeType: string, _parentId?: string) => {
      return {
        id: 'mock-gdrive-file-id-999',
        name: filename,
        mimeType: mimeType,
        webViewLink: `https://drive.google.com/file/d/mock-gdrive-file-id-999/view`
      };
    };

    googleDriveService.getDriveClient = () => {
      return {
        permissions: {
          create: async () => ({})
        }
      };
    };

    googleDriveService.deleteFile = async () => {};
  };

  const restoreMocks = () => {
    googleDriveService.getOrCreateFolder = originalGetOrCreateFolder;
    googleDriveService.uploadFile = originalUploadFile;
    googleDriveService.getDriveClient = originalGetDriveClient;
    googleDriveService.deleteFile = originalDeleteFile;
  };

  // 1. RBAC Tests
  await testCase('Upload: Client role is blocked (403)', async () => {
    setupMocks();
    try {
      const mockFile = {
        buffer: Buffer.from('dummy content'),
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: 1024
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, clientUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected authorization to fail');
      if (nextError.statusCode !== 403) throw new Error(`Expected 403, got ${nextError.statusCode}`);
    } finally {
      restoreMocks();
    }
  });

  await testCase('Upload: Photographer role is blocked (403)', async () => {
    setupMocks();
    try {
      const mockFile = {
        buffer: Buffer.from('dummy content'),
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: 1024
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, photographerUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected authorization to fail');
      if (nextError.statusCode !== 403) throw new Error(`Expected 403, got ${nextError.statusCode}`);
    } finally {
      restoreMocks();
    }
  });

  // 2. File validation tests
  await testCase('Upload: Missing file payload returns 400', async () => {
    setupMocks();
    try {
      const { req, res, next, results } = mockRequestResponse({}, {}, {}, undefined, adminUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected validation to fail');
      if (nextError.statusCode !== 400) throw new Error(`Expected 400, got ${nextError.statusCode}`);
      if (!nextError.message.includes('No file provided')) throw new Error(`Unexpected message: ${nextError.message}`);
    } finally {
      restoreMocks();
    }
  });

  await testCase('Upload: Zero-byte file returns 400', async () => {
    setupMocks();
    try {
      const mockFile = {
        buffer: Buffer.alloc(0),
        originalname: 'empty.jpg',
        mimetype: 'image/jpeg',
        size: 0
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, adminUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected validation to fail');
      if (nextError.statusCode !== 400) throw new Error(`Expected 400, got ${nextError.statusCode}`);
      if (!nextError.message.includes('Zero-byte')) throw new Error(`Unexpected message: ${nextError.message}`);
    } finally {
      restoreMocks();
    }
  });

  await testCase('Upload: File exceeding 5MB returns 400', async () => {
    setupMocks();
    try {
      const mockFile = {
        buffer: Buffer.alloc(6 * 1024 * 1024), // 6MB
        originalname: 'big.png',
        mimetype: 'image/png',
        size: 6 * 1024 * 1024
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, adminUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected validation to fail');
      if (nextError.statusCode !== 400) throw new Error(`Expected 400, got ${nextError.statusCode}`);
      if (!nextError.message.includes('exceeds the 5MB limit')) throw new Error(`Unexpected message: ${nextError.message}`);
    } finally {
      restoreMocks();
    }
  });

  await testCase('Upload: Invalid MIME type (e.g. application/pdf) returns 400', async () => {
    setupMocks();
    try {
      const mockFile = {
        buffer: Buffer.from('dummy pdf'),
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: 1024
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, adminUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected validation to fail');
      if (nextError.statusCode !== 400) throw new Error(`Expected 400, got ${nextError.statusCode}`);
      if (!nextError.message.includes('not allowed')) throw new Error(`Unexpected message: ${nextError.message}`);
    } finally {
      restoreMocks();
    }
  });

  // 3. Success upload tests
  await testCase('Upload: Valid image upload works and returns success metadata', async () => {
    setupMocks();
    try {
      const mockFile = {
        buffer: Buffer.from('dummy image content'),
        originalname: 'my-photo.WEBP',
        mimetype: 'image/webp',
        size: 2048
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, managerUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (!responseData.success) throw new Error('Expected success true');
      if (responseData.fileId !== 'mock-gdrive-file-id-999') throw new Error('Incorrect fileId');
      if (responseData.imageUrl !== 'https://lh3.googleusercontent.com/d/mock-gdrive-file-id-999') {
        throw new Error(`Incorrect imageUrl format: ${responseData.imageUrl}`);
      }
      if (responseData.mimeType !== 'image/webp') throw new Error('Incorrect mimeType');
      if (!responseData.filename.endsWith('.webp')) throw new Error('Expected unique filename with extension .webp');
      if (responseData.filename.includes('my-photo')) throw new Error('Expected original filename to be replaced');
    } finally {
      restoreMocks();
    }
  });

  // 4. Failure and cleanup tests
  await testCase('Upload: Permission creation failure aborts upload and deletes Drive file', async () => {
    let deleteFileCalledWith: string | null = null;
    googleDriveService.getOrCreateFolder = async () => 'mock-folder-id';
    googleDriveService.uploadFile = async () => ({
      id: 'mock-permission-fail-file-id',
      name: 'cover.jpg',
      mimeType: 'image/jpeg',
      webViewLink: 'https://drive.google.com/file/d/mock-permission-fail-file-id/view'
    });
    googleDriveService.deleteFile = async (fileId: string) => {
      deleteFileCalledWith = fileId;
    };
    googleDriveService.getDriveClient = () => {
      return {
        permissions: {
          create: async () => {
            throw new Error('Public sharing is disabled by organizational policy');
          }
        }
      };
    };

    try {
      const mockFile = {
        buffer: Buffer.from('dummy content'),
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: 1024
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, managerUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected upload to fail due to permission error');
      if (nextError.statusCode !== 502) throw new Error(`Expected status 502, got ${nextError.statusCode}`);
      if (deleteFileCalledWith !== 'mock-permission-fail-file-id') {
        throw new Error(`Expected Drive deleteFile to be called with 'mock-permission-fail-file-id', got: ${deleteFileCalledWith}`);
      }
    } finally {
      restoreMocks();
    }
  });

  await testCase('Upload: Accessibility verification failure aborts upload and deletes Drive file', async () => {
    let deleteFileCalledWith: string | null = null;
    googleDriveService.getOrCreateFolder = async () => 'mock-folder-id';
    googleDriveService.uploadFile = async () => ({
      id: 'mock-verify-fail-file-id',
      name: 'cover.jpg',
      mimeType: 'image/jpeg',
      webViewLink: 'https://drive.google.com/file/d/mock-verify-fail-file-id/view'
    });
    googleDriveService.deleteFile = async (fileId: string) => {
      deleteFileCalledWith = fileId;
    };
    googleDriveService.getDriveClient = () => {
      return {
        permissions: {
          create: async () => ({})
        }
      };
    };

    try {
      const mockFile = {
        buffer: Buffer.from('dummy content'),
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: 1024
      };

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, mockFile, managerUser);
      await uploadWebsiteGalleryCover(req, res, next);
      const { nextError } = results();

      if (!nextError) throw new Error('Expected upload to fail due to verification failure');
      if (nextError.statusCode !== 502) throw new Error(`Expected status 502, got ${nextError.statusCode}`);
      if (deleteFileCalledWith !== 'mock-verify-fail-file-id') {
        throw new Error(`Expected Drive deleteFile to be called with 'mock-verify-fail-file-id', got: ${deleteFileCalledWith}`);
      }
    } finally {
      restoreMocks();
    }
  });

  console.log(`\n📊 Website Gallery Upload Integration Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    throw new Error('Some website gallery upload integration tests failed');
  }
}
