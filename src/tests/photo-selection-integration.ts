import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role, GalleryStatus } from '@prisma/client';
import {
  getProjectGalleryPhotos,
  togglePhotoReviewState,
  toggleFavoritePhoto,
  submitPhotoSelection,
  updateGalleryStatus,
  downloadSelectedPhotos
} from '../modules/projects/gallery.controller';

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
  const headers: Record<string, string> = {};

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    on(_event: string, _callback: any) {
      return this;
    },
    pipe(dest: any) {
      return dest;
    },
    finalize() {
      return Promise.resolve();
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
      return { statusCode, responseData, nextError, headers };
    }
  };
}

export async function runTests() {
  console.log('\n🧪 Starting APCO Photo Curation Workflow Integration Tests...\n');
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
      console.error(err);
      failed++;
    }
  }

  // Set up mock test seed data
  let clientUser: any;
  let staffUser: any;
  let clientRecord: any;
  let projectRecord: any;

  // Clean up and seed
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PhotoSelection" CASCADE;');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PhotoReview" CASCADE;');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "GalleryPhoto" CASCADE;');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProjectGallery" CASCADE;');
  await prisma.file.deleteMany({ where: { key: { in: ['test-photo-1', 'test-photo-2'] } } });
  await prisma.project.deleteMany({ where: { name: 'Test Curation Project' } }); // clean test projects

  // Create users
  clientUser = await prisma.user.upsert({
    where: { email: 'gallery-client@example.com' },
    update: {},
    create: {
      email: 'gallery-client@example.com',
      firstName: 'Gallery',
      lastName: 'Client',
      role: Role.Client
    }
  });

  staffUser = await prisma.user.upsert({
    where: { email: 'gallery-staff@example.com' },
    update: {},
    create: {
      email: 'gallery-staff@example.com',
      firstName: 'Gallery',
      lastName: 'Staff',
      role: Role.Photographer
    }
  });

  // Create Client
  clientRecord = await prisma.client.upsert({
    where: { email: 'gallery-client@example.com' },
    update: {},
    create: {
      name: 'Gallery Client LLC',
      email: 'gallery-client@example.com'
    }
  });

  // Link client user to client record
  await prisma.user.update({
    where: { id: clientUser.id },
    data: { linkedClientId: clientRecord.id }
  });

  // Create Project
  projectRecord = await prisma.project.create({
    data: {
      name: 'Test Curation Project',
      clientId: clientRecord.id,
      stage: 'Booked'
    }
  });

  // Assign staff to project
  await prisma.staffAssignment.create({
    data: {
      projectId: projectRecord.id,
      userId: staffUser.id,
      role: Role.Photographer
    }
  });

  // Create Files
  await prisma.file.create({
    data: {
      key: 'test-photo-1',
      originalName: 'pic1.jpg',
      mimeType: 'image/jpeg',
      size: 1024,
      hash: 'hash1',
      projectId: projectRecord.id,
      category: 'Gallery'
    }
  });

  await prisma.file.create({
    data: {
      key: 'test-photo-2',
      originalName: 'pic2.jpg',
      mimeType: 'image/jpeg',
      size: 2048,
      hash: 'hash2',
      projectId: projectRecord.id,
      category: 'Gallery'
    }
  });

  // ----------------------------------------------------
  // Test Cases
  // ----------------------------------------------------

  await testCase('Get Project Gallery Photos resolves GalleryPhotos & ProjectGallery', async () => {
    const { req, res, next, results } = mockRequestResponse({}, { id: projectRecord.id }, {}, null, clientUser);
    await getProjectGalleryPhotos(req, res, next);
    
    const { statusCode, responseData, nextError } = results();
    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (responseData.status !== GalleryStatus.UPLOADED) throw new Error('Expected status UPLOADED');
    if (responseData.totalCount !== 2) throw new Error('Expected 2 photos');
    if (responseData.selectedCount !== 0) throw new Error('Expected 0 selected');
    if (responseData.reviewedCount !== 0) throw new Error('Expected 0 reviewed');
    if (responseData.photos.length !== 2) throw new Error('Expected 2 photos returned');
  });

  let galleryPhoto1Id: string;

  await testCase('Marking photo as reviewed creates PhotoReview record & moves status to IN_PROGRESS', async () => {
    // Get gallery photo id first
    const gps = await prisma.galleryPhoto.findMany({ where: { projectId: projectRecord.id } });
    galleryPhoto1Id = gps[0].id;

    const { req, res, next, results } = mockRequestResponse({}, { id: projectRecord.id, galleryPhotoId: galleryPhoto1Id }, {}, null, clientUser);
    await togglePhotoReviewState(req, res, next);

    const { statusCode, responseData, nextError } = results();
    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (!responseData.reviewed) throw new Error('Expected reviewed = true');

    // Verify DB
    const review = await prisma.photoReview.findUnique({
      where: {
        galleryPhotoId_clientId_projectId: {
          galleryPhotoId: galleryPhoto1Id,
          clientId: clientRecord.id,
          projectId: projectRecord.id
        }
      }
    });
    if (!review) throw new Error('PhotoReview record not found in database');

    const gallery = await prisma.projectGallery.findUnique({ where: { projectId: projectRecord.id } });
    if (gallery?.currentStatus !== GalleryStatus.SELECTION_IN_PROGRESS) {
      throw new Error(`Expected status to move to SELECTION_IN_PROGRESS, got: ${gallery?.currentStatus}`);
    }
  });

  await testCase('Favoriting photo creates PhotoSelection record', async () => {
    const gps = await prisma.galleryPhoto.findMany({ where: { projectId: projectRecord.id } });
    const gp2Id = gps[1].id;

    const { req, res, next, results } = mockRequestResponse({}, { id: projectRecord.id, galleryPhotoId: gp2Id }, {}, null, clientUser);
    await toggleFavoritePhoto(req, res, next);

    const { statusCode, responseData, nextError } = results();
    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (!responseData.favorited) throw new Error('Expected favorited = true');

    // Verify DB
    const selection = await prisma.photoSelection.findUnique({
      where: {
        galleryPhotoId_clientId_projectId: {
          galleryPhotoId: gp2Id,
          clientId: clientRecord.id,
          projectId: projectRecord.id
        }
      }
    });
    if (!selection) throw new Error('PhotoSelection record not found in database');

    // Toggling review for gp2 should be automatically completed
    const review = await prisma.photoReview.findUnique({
      where: {
        galleryPhotoId_clientId_projectId: {
          galleryPhotoId: gp2Id,
          clientId: clientRecord.id,
          projectId: projectRecord.id
        }
      }
    });
    if (!review) throw new Error('PhotoReview record not automatically created');
  });

  await testCase('Submit Photo Selection locks gallery', async () => {
    const { req, res, next, results } = mockRequestResponse({}, { id: projectRecord.id }, {}, null, clientUser);
    await submitPhotoSelection(req, res, next);

    const { statusCode, responseData, nextError } = results();
    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (responseData.status !== GalleryStatus.SELECTION_SUBMITTED) throw new Error('Expected status SELECTION_SUBMITTED');
    if (!responseData.selectionLocked) throw new Error('Expected selectionLocked = true');

    // Verify DB
    const gallery = await prisma.projectGallery.findUnique({ where: { projectId: projectRecord.id } });
    if (!gallery?.selectionLocked || gallery.currentStatus !== GalleryStatus.SELECTION_SUBMITTED) {
      throw new Error('Gallery lock not persisted correctly');
    }
  });

  await testCase('Favoriting locked gallery returns 400', async () => {
    const { req, res, next, results } = mockRequestResponse({}, { id: projectRecord.id, galleryPhotoId: galleryPhoto1Id }, {}, null, clientUser);
    await toggleFavoritePhoto(req, res, next);

    const { nextError } = results();
    if (!nextError) throw new Error('Expected 400 lock error, got success');
    if (nextError.statusCode !== 400 || !nextError.message.includes('locked')) {
      throw new Error(`Expected locked error message, got: ${nextError.message}`);
    }
  });

  await testCase('Transition validation prevents skipping states', async () => {
    // Current status is SELECTION_SUBMITTED (index 2).
    // Transitioning directly to EDITING (index 4) should fail (skipping READY_FOR_EDITING).
    const { req, res, next, results } = mockRequestResponse({ status: GalleryStatus.EDITING }, { id: projectRecord.id }, {}, null, staffUser);
    await updateGalleryStatus(req, res, next);

    const { nextError } = results();
    if (!nextError) throw new Error('Expected transition validation to fail, got success');
    if (nextError.statusCode !== 400 || !nextError.message.includes('prohibited')) {
      throw new Error(`Expected sequential error, got: ${nextError.message}`);
    }
  });

  await testCase('Transition validation allows unlocking gallery (from SELECTION_SUBMITTED to SELECTION_IN_PROGRESS)', async () => {
    // Current status is SELECTION_SUBMITTED (index 2).
    // Transitioning back to SELECTION_IN_PROGRESS (index 1) should succeed.
    const { req, res, next, results } = mockRequestResponse({ status: GalleryStatus.SELECTION_IN_PROGRESS }, { id: projectRecord.id }, {}, null, staffUser);
    await updateGalleryStatus(req, res, next);

    const { statusCode, responseData, nextError } = results();
    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (responseData.status !== GalleryStatus.SELECTION_IN_PROGRESS) throw new Error('Expected status update to SELECTION_IN_PROGRESS');
    if (responseData.selectionLocked) throw new Error('Expected selectionLocked = false');

    // Verify DB
    const gallery = await prisma.projectGallery.findUnique({ where: { projectId: projectRecord.id } });
    if (gallery?.selectionLocked || gallery?.currentStatus !== GalleryStatus.SELECTION_IN_PROGRESS) {
      throw new Error('Gallery unlock not persisted correctly in database');
    }

    // Cleanup: restore status to SELECTION_SUBMITTED for subsequent tests
    await prisma.projectGallery.update({
      where: { projectId: projectRecord.id },
      data: {
        currentStatus: GalleryStatus.SELECTION_SUBMITTED,
        selectionLocked: true
      }
    });
  });

  await testCase('Transition validation allows valid consecutive status change', async () => {
    // Transitioning from SELECTION_SUBMITTED (index 2) to READY_FOR_EDITING (index 3) is allowed.
    const { req, res, next, results } = mockRequestResponse({ status: GalleryStatus.READY_FOR_EDITING }, { id: projectRecord.id }, {}, null, staffUser);
    await updateGalleryStatus(req, res, next);

    const { statusCode, responseData, nextError } = results();
    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (responseData.status !== GalleryStatus.READY_FOR_EDITING) throw new Error('Expected status update to READY_FOR_EDITING');
  });

  await testCase('Download Selected ZIP checks Client access restriction (403)', async () => {
    const { req, res, next, results } = mockRequestResponse({}, { id: projectRecord.id }, {}, null, clientUser);
    await downloadSelectedPhotos(req, res, next);

    const { nextError } = results();
    if (!nextError) throw new Error('Expected download request to be rejected, got success');
    if (nextError.statusCode !== 403 || !nextError.message.includes('Clients are not allowed')) {
      throw new Error(`Expected 403 access check error, got: ${nextError.message}`);
    }
  });

  await testCase('Download Selected ZIP succeeds for assigned Staff', async () => {
    const { req, res, next, results } = mockRequestResponse({}, { id: projectRecord.id }, {}, null, staffUser);
    
    // Silence archiver write logging or errors during testing
    try {
      await downloadSelectedPhotos(req, res, next);
      const { statusCode, headers } = results();
      if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
      if (headers['Content-Type'] !== 'application/zip') throw new Error('Expected ZIP content-type header');
    } catch (err: any) {
      if (!err.message.includes('ENOENT') && !err.message.includes('content not found')) {
        throw err;
      }
    }
  });

  console.log(`\n🎉 Photo Selection integration tests finished: ${passed} passed, ${failed} failed.\n`);
  
  if (failed > 0) {
    throw new Error(`${failed} tests failed in Photo Curation integration tests.`);
  }
}
