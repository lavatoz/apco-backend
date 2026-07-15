import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role, DivisionMediaType } from '@prisma/client';
import {
  getDivisions,
  getDivisionById,
  createDivision,
  updateDivision,
  deleteDivision,
  getPublicDivisions,
  uploadDivisionMedia
} from '../modules/divisions/divisions.controller';

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
  console.log('\n🧪 Starting APCO Website Divisions CRUD & Upload Integration Tests...\n');
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

  // Mock Google Drive helpers
  const googleDriveService = require('../services/google-drive.service');
  const originalDeleteFile = googleDriveService.deleteFile;
  const originalUploadFile = googleDriveService.uploadFile;
  const originalGetOrCreateFolder = googleDriveService.getOrCreateFolder;
  const originalGetDriveClient = googleDriveService.getDriveClient;

  const deletedFileIds: string[] = [];
  googleDriveService.deleteFile = async (fileId: string) => {
    deletedFileIds.push(fileId);
  };
  googleDriveService.getOrCreateFolder = async (name: string, _parent?: string) => {
    return `folder-id-for-${name.replace(/\s+/g, '-').toLowerCase()}`;
  };
  googleDriveService.uploadFile = async (_buf: any, filename: string, mimeType: string, _parentId: string) => {
    return {
      id: `drive-file-id-${filename}`,
      name: filename,
      mimeType,
      webViewLink: `https://drive.google.com/file/d/drive-file-id-${filename}/view`
    };
  };
  googleDriveService.getDriveClient = () => {
    return {
      permissions: {
        create: async () => ({})
      }
    };
  };

  // Define mock users
  const adminUser = { id: 'admin-1', email: 'admin@apco.com', role: Role.SystemAdmin };
  const clientUser = { id: 'client-1', email: 'client@apco.com', role: Role.Client };

  try {
    // Cleanup any existing division items
    await prisma.division.deleteMany({});

    // Test Case 1: Non-admin role cannot list, create, update, delete
    await testCase('RBAC: Non-admin access is blocked with 403', async () => {
      const { req, res, next, results } = mockRequestResponse({}, {}, {}, undefined, clientUser);
      
      await getDivisions(req, res, next);
      if (!results().nextError || results().nextError.statusCode !== 403) {
        throw new Error(`Expected 403, got error: ${results().nextError?.message}`);
      }

      await createDivision(req, res, next);
      if (!results().nextError || results().nextError.statusCode !== 403) {
        throw new Error(`Expected 403, got error: ${results().nextError?.message}`);
      }
    });

    // Test Case 2: Media Upload limits and validations
    await testCase('Upload: Size and MIME validations', async () => {
      // 1. Invalid MIME type (e.g. PDF)
      const fakePdf = { buffer: Buffer.from('pdf'), originalname: 'doc.pdf', mimetype: 'application/pdf', size: 100 };
      const { req: req1, res: res1, next: next1, results: results1 } = mockRequestResponse({}, {}, {}, fakePdf, adminUser);
      await uploadDivisionMedia(req1, res1, next1);
      if (!results1().nextError || results1().nextError.statusCode !== 400 || !results1().nextError.message.includes('MIME')) {
        throw new Error(`Expected 400 MIME error, got: ${results1().nextError?.message}`);
      }

      // 2. Large Image (> 5MB)
      const largeImage = { buffer: Buffer.from('large'), originalname: 'pic.jpg', mimetype: 'image/jpeg', size: 6 * 1024 * 1024 };
      const { req: req2, res: res2, next: next2, results: results2 } = mockRequestResponse({}, {}, {}, largeImage, adminUser);
      await uploadDivisionMedia(req2, res2, next2);
      if (!results2().nextError || results2().nextError.statusCode !== 400 || !results2().nextError.message.includes('5MB')) {
        throw new Error(`Expected 400 Image limit error, got: ${results2().nextError?.message}`);
      }

      // 3. Large Video (> 50MB)
      const largeVideo = { buffer: Buffer.from('large-video'), originalname: 'vid.mp4', mimetype: 'video/mp4', size: 55 * 1024 * 1024 };
      const { req: req3, res: res3, next: next3, results: results3 } = mockRequestResponse({}, {}, {}, largeVideo, adminUser);
      await uploadDivisionMedia(req3, res3, next3);
      if (!results3().nextError || results3().nextError.statusCode !== 400 || !results3().nextError.message.includes('50MB')) {
        throw new Error(`Expected 400 Video limit error, got: ${results3().nextError?.message}`);
      }
    });

    // Test Case 3: Valid media upload succeeds
    await testCase('Upload: Valid image and video upload succeeds', async () => {
      const mockImg = { buffer: Buffer.from('jpg'), originalname: 'cover.jpg', mimetype: 'image/jpeg', size: 1000 };
      const { req: req1, res: res1, next: next1, results: results1 } = mockRequestResponse({}, {}, {}, mockImg, adminUser);
      await uploadDivisionMedia(req1, res1, next1);
      const resVal1 = results1();
      if (resVal1.nextError) throw resVal1.nextError;
      if (resVal1.statusCode !== 200) throw new Error(`Expected 200, got ${resVal1.statusCode}`);
      if (!resVal1.responseData.url.startsWith('https://lh3.googleusercontent.com/d/')) {
        throw new Error(`Expected direct view url format, got: ${resVal1.responseData.url}`);
      }

      const mockVid = { buffer: Buffer.from('mp4'), originalname: 'clip.mp4', mimetype: 'video/mp4', size: 2000 };
      const { req: req2, res: res2, next: next2, results: results2 } = mockRequestResponse({}, {}, {}, mockVid, adminUser);
      await uploadDivisionMedia(req2, res2, next2);
      const resVal2 = results2();
      if (resVal2.nextError) throw resVal2.nextError;
      if (resVal2.statusCode !== 200) throw new Error(`Expected 200, got ${resVal2.statusCode}`);
    });

    // Test Case 4: Creating a division with valid media
    let divisionId1: string;
    let divisionId2: string;
    await testCase('CRUD: Create division with media', async () => {
      const payload1 = {
        name: 'AAHA Kalyanam',
        description: 'Wedding Cinema Division',
        instagramUrl: 'https://instagram.com/aahakalyanam',
        published: true,
        coverMediaId: 'file-img-1',
        media: [
          { type: DivisionMediaType.IMAGE, position: 1, url: 'https://lh3.googleusercontent.com/d/file-img-1', fileId: 'file-img-1' },
          { type: DivisionMediaType.IMAGE, position: 2, url: 'https://lh3.googleusercontent.com/d/file-img-2', fileId: 'file-img-2' },
          { type: DivisionMediaType.VIDEO, position: 4, url: 'https://lh3.googleusercontent.com/d/file-vid-4', fileId: 'file-vid-4' },
        ]
      };

      const { req, res, next, results } = mockRequestResponse(payload1, {}, {}, undefined, adminUser);
      await createDivision(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 201) throw new Error(`Expected 201, got ${statusCode}`);
      if (responseData.name !== 'AAHA Kalyanam') throw new Error('Name mismatch');
      if (responseData.media.length !== 3) throw new Error(`Expected 3 media items, got ${responseData.media.length}`);
      if (responseData.media[0].position !== 1) throw new Error('Expected media ordered by position ASC');
      if (responseData.coverMediaId !== 'file-img-1') throw new Error('coverMediaId mismatch');

      divisionId1 = responseData.id;

      // Create a second published division (later timestamp)
      const payload2 = {
        name: 'Tiny Toes',
        description: 'Baby Photography',
        published: true,
        media: []
      };
      const { req: req2, res: res2, next: next2, results: results2 } = mockRequestResponse(payload2, {}, {}, undefined, adminUser);
      await createDivision(req2, res2, next2);
      divisionId2 = results2().responseData.id;
    });

    // Test Case 5: Listing all divisions and detail retrieval
    await testCase('CRUD: List and detail retrieval', async () => {
      const { req, res, next, results } = mockRequestResponse({}, {}, {}, undefined, adminUser);
      await getDivisions(req, res, next);
      if (results().statusCode !== 200 || results().responseData.length !== 2) {
        throw new Error('Listing failed');
      }

      const { req: req2, res: res2, next: next2, results: results2 } = mockRequestResponse({}, { id: divisionId1 }, {}, undefined, adminUser);
      await getDivisionById(req2, res2, next2);
      if (results2().statusCode !== 200 || results2().responseData.name !== 'AAHA Kalyanam') {
        throw new Error('Get details by ID failed');
      }
    });

    // Test Case 6: Updating division and cleaning up orphaned Drive files
    await testCase('CRUD: Update division and clean up orphaned files from Google Drive', async () => {
      deletedFileIds.length = 0; // reset tracker

      const updatePayload = {
        name: 'AAHA Kalyanam Updated',
        description: 'Premium Wedding Cinema',
        instagramUrl: 'https://instagram.com/aahakalyanam-updated',
        published: true,
        coverMediaId: 'file-img-2',
        media: [
          // Keeping file-img-2, removing file-img-1 and file-vid-4, adding file-vid-4-new (pos 4)
          { type: DivisionMediaType.IMAGE, position: 2, url: 'https://lh3.googleusercontent.com/d/file-img-2', fileId: 'file-img-2' },
          { type: DivisionMediaType.VIDEO, position: 4, url: 'https://lh3.googleusercontent.com/d/file-vid-4-new', fileId: 'file-vid-4-new' },
        ]
      };

      const { req, res, next, results } = mockRequestResponse(updatePayload, { id: divisionId1 }, {}, undefined, adminUser);
      await updateDivision(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (responseData.name !== 'AAHA KalyanamUpdated' && responseData.name !== 'AAHA Kalyanam Updated') {
        throw new Error(`Name was not updated, got: ${responseData.name}`);
      }

      // Old media was deleted, new media is registered
      const dbMedia = await prisma.divisionMedia.findMany({ where: { divisionId: divisionId1 } });
      if (dbMedia.length !== 2) {
        throw new Error(`Expected 2 media records in DB, got ${dbMedia.length}`);
      }

      // Verify orphaned files (file-img-1 and file-vid-4) were deleted from Drive
      if (!deletedFileIds.includes('file-img-1') || !deletedFileIds.includes('file-vid-4')) {
        throw new Error(`Drive deleteFile was not called for orphaned files: ${JSON.stringify(deletedFileIds)}`);
      }
    });

    // Test Case 7: Public endpoint selective field checks, published-only, DESC ordering, and ordered media position
    await testCase('Public API: Filtering, DESC sorting, selective fields and media position order', async () => {
      // Temporarily mark one division as draft (published = false)
      await prisma.division.update({
        where: { id: divisionId2 },
        data: { published: false }
      });

      const { req, res, next, results } = mockRequestResponse({}, {}, {}, undefined, undefined);
      await getPublicDivisions(req, res, next);
      const { statusCode, responseData, nextError } = results();

      if (nextError) throw nextError;
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      
      // Should only list 1 published item
      if (responseData.length !== 1) {
        throw new Error(`Expected only 1 published item, got: ${responseData.length}`);
      }

      const item = responseData[0];
      // Fields checks
      if (!item.name || !item.description || !item.instagramUrl) throw new Error('Missing basic public fields');
      if (item.createdAt !== undefined || item.updatedAt !== undefined || item.coverMediaId !== undefined) {
        throw new Error('Public endpoint exposed non-required fields!');
      }

      // Media checks
      if (item.media.length !== 2) throw new Error('Public media list mismatch');
      if (item.media[0].fileId !== undefined) {
        throw new Error('Public media endpoint exposed secure fileId!');
      }
      if (item.media[0].position !== 2 || item.media[1].position !== 4) {
        throw new Error('Public media not returned in position ASC order');
      }
    });

    // Test Case 8: Deleting division cascade DB delete and Drive cleanup
    await testCase('CRUD: Delete division cascade and Drive cleanup', async () => {
      deletedFileIds.length = 0; // reset
      const { req, res, next, results } = mockRequestResponse({}, { id: divisionId1 }, {}, undefined, adminUser);
      await deleteDivision(req, res, next);

      if (results().statusCode !== 200) throw new Error('Delete failed');

      // Check DB records
      const checkDiv = await prisma.division.findUnique({ where: { id: divisionId1 } });
      if (checkDiv) throw new Error('Division DB record still exists');

      const checkMedia = await prisma.divisionMedia.findMany({ where: { divisionId: divisionId1 } });
      if (checkMedia.length > 0) throw new Error('DivisionMedia DB records were not cascaded deleted');

      // Verify Google Drive deleteFile was triggered for remaining files (file-img-2 and file-vid-4-new)
      if (!deletedFileIds.includes('file-img-2') || !deletedFileIds.includes('file-vid-4-new')) {
        throw new Error(`Drive deleteFile was not called for remaining files on delete: ${JSON.stringify(deletedFileIds)}`);
      }
    });

    // Test Case 9: Explicit lifecycle cleanup scenarios and reference checking
    await testCase('Lifecycle: Explicit replace, remove, referenced check, and repeated save operations', async () => {
      deletedFileIds.length = 0; // reset tracker

      // 1. Create a division with 3 images (pos 1, 2, 3) and 1 video (pos 4)
      const divisionPayload = {
        name: 'Lifecycle Test Division',
        description: 'Testing lifecycle cleanups',
        coverMediaId: 'life-img-1',
        media: [
          { type: DivisionMediaType.IMAGE, position: 1, url: 'https://lh3.googleusercontent.com/d/life-img-1', fileId: 'life-img-1' },
          { type: DivisionMediaType.IMAGE, position: 2, url: 'https://lh3.googleusercontent.com/d/life-img-2', fileId: 'life-img-2' },
          { type: DivisionMediaType.IMAGE, position: 3, url: 'https://lh3.googleusercontent.com/d/life-img-3', fileId: 'life-img-3' },
          { type: DivisionMediaType.VIDEO, position: 4, url: 'https://drive.google.com/uc?id=life-vid-4', fileId: 'life-vid-4' },
        ]
      };

      const { req: createReq, res: createRes, next: createNext, results: createResults } = mockRequestResponse(divisionPayload, {}, {}, undefined, adminUser);
      await createDivision(createReq, createRes, createNext);
      const newDiv = createResults().responseData;
      const divId = newDiv.id;

      // 2. Scenario: Reference checking. We create another division referencing 'life-img-1' as coverMediaId.
      const sharedPayload = {
        name: 'Shared Media Division',
        description: 'References a file from the other division',
        coverMediaId: 'life-img-1',
        media: []
      };
      const { req: sharedReq, res: sharedRes, next: sharedNext, results: sharedResults } = mockRequestResponse(sharedPayload, {}, {}, undefined, adminUser);
      await createDivision(sharedReq, sharedRes, sharedNext);
      const sharedDivId = sharedResults().responseData.id;

      // 3. Scenario: Replace Photo 1 (position 1) in lifecycle division
      // Since 'life-img-1' is still referenced by Shared Media Division as coverMediaId, it should NOT be deleted from Drive!
      deletedFileIds.length = 0; // reset
      const replacePayload1 = {
        ...divisionPayload,
        media: [
          { type: DivisionMediaType.IMAGE, position: 1, url: 'https://lh3.googleusercontent.com/d/life-img-1-new', fileId: 'life-img-1-new' }, // replaced
          { type: DivisionMediaType.IMAGE, position: 2, url: 'https://lh3.googleusercontent.com/d/life-img-2', fileId: 'life-img-2' },
          { type: DivisionMediaType.IMAGE, position: 3, url: 'https://lh3.googleusercontent.com/d/life-img-3', fileId: 'life-img-3' },
          { type: DivisionMediaType.VIDEO, position: 4, url: 'https://drive.google.com/uc?id=life-vid-4', fileId: 'life-vid-4' },
        ]
      };
            const { req: repReq1, res: repRes1, next: repNext1 } = mockRequestResponse(replacePayload1, { id: divId }, {}, undefined, adminUser);
      await updateDivision(repReq1, repRes1, repNext1);
      if (deletedFileIds.includes('life-img-1')) {
        throw new Error('Expected shared file life-img-1 to not be deleted as it is still referenced as coverMediaId elsewhere!');
      }

      // 4. Scenario: Replace Photo 2 (position 2) in lifecycle division
      // 'life-img-2' is not referenced anywhere else, it should be deleted.
      deletedFileIds.length = 0; // reset
      const replacePayload2 = {
        ...replacePayload1,
        media: [
          { type: DivisionMediaType.IMAGE, position: 1, url: 'https://lh3.googleusercontent.com/d/life-img-1-new', fileId: 'life-img-1-new' },
          { type: DivisionMediaType.IMAGE, position: 2, url: 'https://lh3.googleusercontent.com/d/life-img-2-new', fileId: 'life-img-2-new' }, // replaced
          { type: DivisionMediaType.IMAGE, position: 3, url: 'https://lh3.googleusercontent.com/d/life-img-3', fileId: 'life-img-3' },
          { type: DivisionMediaType.VIDEO, position: 4, url: 'https://drive.google.com/uc?id=life-vid-4', fileId: 'life-vid-4' },
        ]
      };
      const { req: repReq2, res: repRes2, next: repNext2 } = mockRequestResponse(replacePayload2, { id: divId }, {}, undefined, adminUser);
      await updateDivision(repReq2, repRes2, repNext2);
      if (!deletedFileIds.includes('life-img-2')) {
        throw new Error('Expected life-img-2 to be deleted upon replacement');
      }

      // 5. Scenario: Replace Photo 3 (position 3) in lifecycle division
      // 'life-img-3' is not referenced anywhere else, it should be deleted.
      deletedFileIds.length = 0; // reset
      const replacePayload3 = {
        ...replacePayload2,
        media: [
          { type: DivisionMediaType.IMAGE, position: 1, url: 'https://lh3.googleusercontent.com/d/life-img-1-new', fileId: 'life-img-1-new' },
          { type: DivisionMediaType.IMAGE, position: 2, url: 'https://lh3.googleusercontent.com/d/life-img-2-new', fileId: 'life-img-2-new' },
          { type: DivisionMediaType.IMAGE, position: 3, url: 'https://lh3.googleusercontent.com/d/life-img-3-new', fileId: 'life-img-3-new' }, // replaced
          { type: DivisionMediaType.VIDEO, position: 4, url: 'https://drive.google.com/uc?id=life-vid-4', fileId: 'life-vid-4' },
        ]
      };
      const { req: repReq3, res: repRes3, next: repNext3 } = mockRequestResponse(replacePayload3, { id: divId }, {}, undefined, adminUser);
      await updateDivision(repReq3, repRes3, repNext3);
      if (!deletedFileIds.includes('life-img-3')) {
        throw new Error('Expected life-img-3 to be deleted upon replacement');
      }

      // 6. Scenario: Replace Video Reel (position 4) in lifecycle division
      // 'life-vid-4' is not referenced anywhere else, it should be deleted.
      deletedFileIds.length = 0; // reset
      const replacePayload4 = {
        ...replacePayload3,
        media: [
          { type: DivisionMediaType.IMAGE, position: 1, url: 'https://lh3.googleusercontent.com/d/life-img-1-new', fileId: 'life-img-1-new' },
          { type: DivisionMediaType.IMAGE, position: 2, url: 'https://lh3.googleusercontent.com/d/life-img-2-new', fileId: 'life-img-2-new' },
          { type: DivisionMediaType.IMAGE, position: 3, url: 'https://lh3.googleusercontent.com/d/life-img-3-new', fileId: 'life-img-3-new' },
          { type: DivisionMediaType.VIDEO, position: 4, url: 'https://drive.google.com/uc?id=life-vid-4-new', fileId: 'life-vid-4-new' }, // replaced
        ]
      };
      const { req: repReq4, res: repRes4, next: repNext4 } = mockRequestResponse(replacePayload4, { id: divId }, {}, undefined, adminUser);
      await updateDivision(repReq4, repRes4, repNext4);
      if (!deletedFileIds.includes('life-vid-4')) {
        throw new Error('Expected life-vid-4 to be deleted upon replacement');
      }

      // 7. Scenario: Delete the Shared Media Division first.
      // This frees the reference to 'life-img-1'.
      const { req: delSharedReq, res: delSharedRes, next: delSharedNext } = mockRequestResponse({}, { id: sharedDivId }, {}, undefined, adminUser);
      await deleteDivision(delSharedReq, delSharedRes, delSharedNext);

      // Now we delete the lifecycle division.
      // All remaining media: 'life-img-1-new', 'life-img-2-new', 'life-img-3-new', 'life-vid-4-new' and cover 'life-img-1' should be deleted!
      deletedFileIds.length = 0; // reset
      const { req: delReq, res: delRes, next: delNext } = mockRequestResponse({}, { id: divId }, {}, undefined, adminUser);
      await deleteDivision(delReq, delRes, delNext);

      const expectedDeletes = ['life-img-1', 'life-img-1-new', 'life-img-2-new', 'life-img-3-new', 'life-vid-4-new'];
      for (const expectedId of expectedDeletes) {
        if (!deletedFileIds.includes(expectedId)) {
          throw new Error(`Expected file ID ${expectedId} to be deleted on division deletion, but it was not!`);
        }
      }
    });

  } finally {
    // Restore original drive helpers
    googleDriveService.deleteFile = originalDeleteFile;
    googleDriveService.uploadFile = originalUploadFile;
    googleDriveService.getOrCreateFolder = originalGetOrCreateFolder;
    googleDriveService.getDriveClient = originalGetDriveClient;

    // Cleanup test data
    await prisma.division.deleteMany({});
  }

  console.log(`\n📊 Website Divisions CRUD & Upload Integration Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    throw new Error('Some website divisions integration tests failed');
  }
}
