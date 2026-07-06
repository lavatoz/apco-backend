import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role } from '@prisma/client';
import { getProjectMessages, createProjectMessage } from '../modules/messages/messages.controller';

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
function mockRequestResponse(body = {}, params = {}, query = {}, user?: any) {
  const req = {
    body,
    params,
    query,
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
  console.log('\n🧪 Starting APCO Project Messaging Integration Tests...\n');
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

  // 1. Setup mock test seed data
  let clientUser: any;
  let staffUser: any;
  let adminUser: any;
  let clientRecord: any;
  let projectRecord: any;

  let otherClientUser: any;
  let otherClientRecord: any;
  let otherStaffUser: any;

  // Clean up
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProjectMessage" CASCADE;');
  await prisma.notification.deleteMany({});
  await prisma.project.deleteMany({ where: { name: 'Messaging Test Project' } });

  // Create Users
  clientUser = await prisma.user.upsert({
    where: { email: 'msg-client@example.com' },
    update: {},
    create: {
      email: 'msg-client@example.com',
      firstName: 'Msg',
      lastName: 'Client',
      role: Role.Client
    }
  });

  staffUser = await prisma.user.upsert({
    where: { email: 'msg-staff@example.com' },
    update: {},
    create: {
      email: 'msg-staff@example.com',
      firstName: 'Msg',
      lastName: 'Staff',
      role: Role.Photographer
    }
  });

  adminUser = await prisma.user.upsert({
    where: { email: 'msg-admin@example.com' },
    update: {},
    create: {
      email: 'msg-admin@example.com',
      firstName: 'Msg',
      lastName: 'Admin',
      role: Role.SystemAdmin
    }
  });

  otherClientUser = await prisma.user.upsert({
    where: { email: 'msg-other-client@example.com' },
    update: {},
    create: {
      email: 'msg-other-client@example.com',
      firstName: 'Other',
      lastName: 'Client',
      role: Role.Client
    }
  });

  otherStaffUser = await prisma.user.upsert({
    where: { email: 'msg-other-staff@example.com' },
    update: {},
    create: {
      email: 'msg-other-staff@example.com',
      firstName: 'Other',
      lastName: 'Staff',
      role: Role.Videographer
    }
  });

  // Create Clients
  clientRecord = await prisma.client.upsert({
    where: { email: 'msg-client@example.com' },
    update: {},
    create: {
      name: 'Msg Client Corp',
      email: 'msg-client@example.com'
    }
  });

  otherClientRecord = await prisma.client.upsert({
    where: { email: 'msg-other-client@example.com' },
    update: {},
    create: {
      name: 'Other Client Corp',
      email: 'msg-other-client@example.com'
    }
  });

  // Link Client Users
  await prisma.user.update({
    where: { id: clientUser.id },
    data: { linkedClientId: clientRecord.id }
  });

  await prisma.user.update({
    where: { id: otherClientUser.id },
    data: { linkedClientId: otherClientRecord.id }
  });

  // Create Project
  projectRecord = await prisma.project.create({
    data: {
      name: 'Messaging Test Project',
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

  // --- Run Test Cases ---

  await testCase('Client can send a custom message and notification is sent to staff', async () => {
    const { req, res, next, results } = mockRequestResponse(
      { message: 'Hi there!' },
      { projectId: projectRecord.id },
      {},
      clientUser
    );

    await createProjectMessage(req, res, next);
    const { statusCode, responseData, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 201) throw new Error(`Expected status 201, got ${statusCode}`);
    if (responseData.message !== 'Hi there!') throw new Error('Incorrect message returned');
    if (responseData.projectId !== projectRecord.id) throw new Error('Incorrect projectId');
    if (responseData.senderId !== clientUser.id) throw new Error('Incorrect senderId');

    // Verify DB Notification was created for assigned staff
    const notification = await prisma.notification.findFirst({
      where: { userId: staffUser.id }
    });
    if (!notification) throw new Error('Expected notification to be created for assigned staff');
    if (!notification.title.includes('New client message')) {
      throw new Error(`Unexpected notification title: ${notification.title}`);
    }
  });

  await testCase('Assigned staff can fetch conversation', async () => {
    const { req, res, next, results } = mockRequestResponse(
      {},
      { projectId: projectRecord.id },
      {},
      staffUser
    );

    await getProjectMessages(req, res, next);
    const { statusCode, responseData, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected status 200, got ${statusCode}`);
    if (!Array.isArray(responseData)) throw new Error('Expected response to be array');
    if (responseData.length !== 1) throw new Error(`Expected 1 message, got ${responseData.length}`);
    if (responseData[0].message !== 'Hi there!') throw new Error('Message mismatch');
  });

  await testCase('Assigned staff can reply and notification is sent to client', async () => {
    const { req, res, next, results } = mockRequestResponse(
      { message: 'Hello! How can we help?' },
      { projectId: projectRecord.id },
      {},
      staffUser
    );

    await createProjectMessage(req, res, next);
    const { statusCode, responseData, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 201) throw new Error(`Expected status 201, got ${statusCode}`);
    if (responseData.message !== 'Hello! How can we help?') throw new Error('Incorrect message');

    // Verify DB Notification was created for client
    const notification = await prisma.notification.findFirst({
      where: { userId: clientUser.id }
    });
    if (!notification) throw new Error('Expected notification to be created for client');
    if (!notification.title.includes('New message')) {
      throw new Error(`Unexpected notification title: ${notification.title}`);
    }
  });

  await testCase('Admin can fetch conversation and see messages in chronological order', async () => {
    const { req, res, next, results } = mockRequestResponse(
      {},
      { projectId: projectRecord.id },
      {},
      adminUser
    );

    await getProjectMessages(req, res, next);
    const { statusCode, responseData, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected status 200, got ${statusCode}`);
    if (responseData.length !== 2) throw new Error(`Expected 2 messages, got ${responseData.length}`);
    if (responseData[0].message !== 'Hi there!') throw new Error('First message should be "Hi there!"');
    if (responseData[1].message !== 'Hello! How can we help?') throw new Error('Second message mismatch');
  });

  await testCase('Unassigned staff is rejected from accessing messages', async () => {
    const { req, res, next, results } = mockRequestResponse(
      {},
      { projectId: projectRecord.id },
      {},
      otherStaffUser
    );

    await getProjectMessages(req, res, next);
    const { nextError } = results();

    if (!nextError) throw new Error('Expected auth to fail and call next(err)');
    if (nextError.statusCode !== 403) throw new Error(`Expected 403, got ${nextError.statusCode}`);
  });

  await testCase('Unrelated client is rejected from accessing messages', async () => {
    const { req, res, next, results } = mockRequestResponse(
      { message: 'Sneaky message' },
      { projectId: projectRecord.id },
      {},
      otherClientUser
    );

    await createProjectMessage(req, res, next);
    const { nextError } = results();

    if (!nextError) throw new Error('Expected creation to fail for unrelated client');
    if (nextError.statusCode !== 403) throw new Error(`Expected 403, got ${nextError.statusCode}`);
  });

  await testCase('Empty or whitespace messages are rejected', async () => {
    // Note: Zod validation is run as route middleware, but we can verify validator here:
    const { CreateMessageSchema } = await import('../modules/messages/messages.validation');
    try {
      CreateMessageSchema.parse({ message: '   ' });
      throw new Error('Expected validation to fail on whitespace');
    } catch (err: any) {
      if (!err.errors) throw err;
    }
  });

  // Clean up test records
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProjectMessage" CASCADE;');
  await prisma.notification.deleteMany({
    where: { userId: { in: [clientUser.id, staffUser.id] } }
  });
  await prisma.project.deleteMany({ where: { id: projectRecord.id } });

  console.log(`\n📊 Messaging Integration Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    throw new Error('Some messaging integration tests failed');
  }
}
