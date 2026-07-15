import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role } from '@prisma/client';
import {
  getWebsiteGalleries,
  getWebsiteGalleryById,
  createWebsiteGallery,
  updateWebsiteGallery,
  deleteWebsiteGallery,
  getPublicWebsiteGalleries
} from '../modules/website-gallery/website-gallery.controller';

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
  console.log('\n🧪 Starting APCO Website Gallery CRUD Integration Tests...\n');
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

  // Mock Google Drive deleteFile
  const googleDriveService = require('../services/google-drive.service');
  const originalDeleteFile = googleDriveService.deleteFile;
  let deleteFileCalledWith: string | null = null;
  googleDriveService.deleteFile = async (fileId: string) => {
    deleteFileCalledWith = fileId;
  };

  // Define mock users
  const adminUser = { id: 'admin-1', email: 'admin@apco.com', role: Role.SystemAdmin };
  const clientUser = { id: 'client-1', email: 'client@apco.com', role: Role.Client };

  try {
    // Cleanup any existing gallery items
    await prisma.websiteGallery.deleteMany({});

    // Test Case 1: Non-admin role cannot list, create, update, delete
    await testCase('Non-admin access is blocked', async () => {
      const { req, res, next, results } = mockRequestResponse({}, {}, {}, undefined, clientUser);
      
      await getWebsiteGalleries(req, res, next);
      const res1 = results();
      if (!res1.nextError || res1.nextError.statusCode !== 403) {
        throw new Error(`Expected 403, got error: ${res1.nextError?.message}`);
      }

      await createWebsiteGallery(req, res, next);
      const res2 = results();
      if (!res2.nextError || res2.nextError.statusCode !== 403) {
        throw new Error(`Expected 403, got error: ${res2.nextError?.message}`);
      }
    });

    // Test Case 2: Admin can create website gallery items
    let galleryId1: string;
    await testCase('Admin can create website gallery items', async () => {
      const payload1 = {
        title: 'Haldi Joy Beachside',
        coverImageUrl: 'https://lh3.googleusercontent.com/d/file-id-123',
        coverImageFileId: 'file-id-123',
        instagramUrl: 'https://instagram.com/p/123',
        published: true
      };

      const { req, res, next, results } = mockRequestResponse(payload1, {}, {}, undefined, adminUser);
      await createWebsiteGallery(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 201) throw new Error(`Expected 201, got ${statusCode}`);
      if (responseData.title !== 'Haldi Joy Beachside') throw new Error('Response title does not match');
      if (!responseData.id) throw new Error('Response missing ID');
      
      galleryId1 = responseData.id;

      // Create a second one (draft)
      const payload2 = {
        title: 'Newborn Sparkle',
        coverImageUrl: 'https://lh3.googleusercontent.com/d/file-id-456',
        coverImageFileId: 'file-id-456',
        published: false
      };
      const { req: req2, res: res2, next: next2, results: results2 } = mockRequestResponse(payload2, {}, {}, undefined, adminUser);
      await createWebsiteGallery(req2, res2, next2);
      const resPayload2 = results2().responseData;
      if (!resPayload2.id) throw new Error('Response missing ID for draft');
    });

    // Test Case 3: Admin can list all galleries ordered by createdAt DESC
    await testCase('Admin can list all website gallery items', async () => {
      const { req, res, next, results } = mockRequestResponse({}, {}, {}, undefined, adminUser);
      await getWebsiteGalleries(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (responseData.length !== 2) throw new Error(`Expected 2 items, got ${responseData.length}`);
      // Newborn Sparkle was created second, so it should be first in DESC order
      if (responseData[0].title !== 'Newborn Sparkle') throw new Error('Expected DESC sorting by createdAt');
    });

    // Test Case 4: Admin can get website gallery by ID
    await testCase('Admin can get website gallery by ID', async () => {
      const { req, res, next, results } = mockRequestResponse({}, { id: galleryId1 }, {}, undefined, adminUser);
      await getWebsiteGalleryById(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (responseData.title !== 'Haldi Joy Beachside') throw new Error('Title does not match');
    });

    // Test Case 5: Admin can update website gallery item
    await testCase('Admin can update website gallery', async () => {
      const updatePayload = {
        title: 'Haldi Joy Beachside Updated',
        coverImageUrl: 'https://lh3.googleusercontent.com/d/file-id-123',
        coverImageFileId: 'file-id-123',
        instagramUrl: 'https://instagram.com/p/123-new',
        published: true
      };

      const { req, res, next, results } = mockRequestResponse(updatePayload, { id: galleryId1 }, {}, undefined, adminUser);
      await updateWebsiteGallery(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (responseData.title !== 'Haldi Joy Beachside Updated') throw new Error('Title was not updated');
      if (responseData.instagramUrl !== 'https://instagram.com/p/123-new') throw new Error('Instagram URL was not updated');
    });

    // Test Case 5b: Updating cover image deletes the old one on Google Drive
    await testCase('Admin updating cover image cleans up old file from Drive', async () => {
      deleteFileCalledWith = null;
      const updatePayload = {
        title: 'Haldi Joy Beachside Updated Again',
        coverImageUrl: 'https://lh3.googleusercontent.com/d/file-id-789-new',
        coverImageFileId: 'file-id-789-new',
        instagramUrl: 'https://instagram.com/p/123-new',
        published: true
      };

      const { req, res, next, results } = mockRequestResponse(updatePayload, { id: galleryId1 }, {}, undefined, adminUser);
      await updateWebsiteGallery(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (responseData.coverImageFileId !== 'file-id-789-new') throw new Error('Cover image file ID was not updated');
      
      // Verify Drive file delete was triggered with the PREVIOUS file ID (file-id-123)
      if (deleteFileCalledWith !== 'file-id-123') {
        throw new Error(`Expected Drive deleteFile to be called with 'file-id-123', got: ${deleteFileCalledWith}`);
      }
    });

    // Test Case 6: Public endpoint returns only published website gallery items sorted by createdAt DESC
    await testCase('Public endpoint returns only published items DESC', async () => {
      const { req, res, next, results } = mockRequestResponse({}, {}, {}, undefined, undefined);
      await getPublicWebsiteGalleries(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (responseData.length !== 1) throw new Error(`Expected only 1 published item, got ${responseData.length}`);
      if (responseData[0].title !== 'Haldi Joy Beachside Updated Again') throw new Error('Published item title mismatch');
    });

    // Test Case 7: Admin can delete website gallery item (and it triggers Drive deleteFile)
    await testCase('Admin can delete website gallery item and cleans up Drive', async () => {
      deleteFileCalledWith = null;
      const { req, res, next, results } = mockRequestResponse({}, { id: galleryId1 }, {}, undefined, adminUser);
      await deleteWebsiteGallery(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (responseData.success !== true) throw new Error('Delete response not success');

      // Verify DB removal
      const checkDb = await prisma.websiteGallery.findUnique({ where: { id: galleryId1 } });
      if (checkDb) throw new Error('Database record still exists after deletion');

      // Verify Drive file delete was triggered with the correct coverImageFileId (file-id-789-new)
      if (deleteFileCalledWith !== 'file-id-789-new') {
        throw new Error(`Expected Drive deleteFile to be called with 'file-id-789-new', got: ${deleteFileCalledWith}`);
      }
    });

  } finally {
    // Restore google drive service mocks
    googleDriveService.deleteFile = originalDeleteFile;
    // Cleanup test data
    await prisma.websiteGallery.deleteMany({});
  }

  console.log(`\n📊 Website Gallery CRUD Integration Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    throw new Error('Some website gallery CRUD integration tests failed');
  }
}
