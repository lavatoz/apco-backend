import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Role } from '@prisma/client';
import {
  registerDeviceToken,
  deleteDeviceToken,
  testPushNotification
} from '../modules/notifications/notifications.controller';
import { PushNotificationService } from '../services/push-notification.service';

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

function mockRequestResponse(body = {}, params = {}, query = {}, user?: any) {
  const req = {
    body,
    params,
    query,
    headers: {
      'user-agent': 'TestRunner/1.0',
    },
    ip: '127.0.0.1',
    requestId: 'test-fcm-id',
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
  console.log('\n🧪 Starting APCO Firebase Cloud Messaging (FCM) Integration Tests...\n');
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

  // Clean up
  await prisma.deviceToken.deleteMany();
  await prisma.user.deleteMany({ where: { email: 'fcm-test-user@example.com' } });

  // Seed user
  const user = await prisma.user.create({
    data: {
      email: 'fcm-test-user@example.com',
      firstName: 'FCM',
      lastName: 'Test',
      role: Role.Client,
      status: 'Active'
    }
  });

  await testCase('Register device token creates record', async () => {
    const { req, res, next, results } = mockRequestResponse(
      { token: 'token-12345', platform: 'ios', deviceId: 'device-apple' },
      {},
      {},
      user
    );

    await registerDeviceToken(req, res, next);
    const { statusCode, responseData, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (responseData.deviceToken.token !== 'token-12345') throw new Error('Incorrect token in response');

    // Verify DB
    const dbRecord = await prisma.deviceToken.findUnique({ where: { token: 'token-12345' } });
    if (!dbRecord) throw new Error('Device token not found in database');
    if (dbRecord.userId !== user.id || dbRecord.platform !== 'ios' || dbRecord.deviceId !== 'device-apple') {
      throw new Error('Database fields did not match input');
    }
  });

  await testCase('Duplicate token upsert updates lastUsedAt and keeps single record', async () => {
    // Initial fetch to get creation time
    const initialRecord = await prisma.deviceToken.findUnique({ where: { token: 'token-12345' } });
    if (!initialRecord) throw new Error('Pre-requisite record not found');

    // Wait slightly to ensure updatedAt/lastUsedAt changes
    await new Promise((resolve) => setTimeout(resolve, 50));

    const { req, res, next, results } = mockRequestResponse(
      { token: 'token-12345', platform: 'android', deviceId: 'device-samsung' },
      {},
      {},
      user
    );

    await registerDeviceToken(req, res, next);
    const { statusCode, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);

    // Verify database count is still 1
    const count = await prisma.deviceToken.count({ where: { token: 'token-12345' } });
    if (count !== 1) throw new Error(`Expected exactly 1 record, found ${count}`);

    // Verify updated values
    const updatedRecord = await prisma.deviceToken.findUnique({ where: { token: 'token-12345' } });
    if (!updatedRecord) throw new Error('Record not found');
    if (updatedRecord.platform !== 'android' || updatedRecord.deviceId !== 'device-samsung') {
      throw new Error('Fields did not update correctly');
    }
    if (updatedRecord.lastUsedAt.getTime() <= initialRecord.lastUsedAt.getTime()) {
      throw new Error('lastUsedAt was not bumped');
    }
  });

  await testCase('Support multiple devices per user', async () => {
    const { req, res, next, results } = mockRequestResponse(
      { token: 'token-67890', platform: 'web', deviceId: 'chrome-browser' },
      {},
      {},
      user
    );

    await registerDeviceToken(req, res, next);
    const { statusCode, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);

    // Verify DB
    const userTokensCount = await prisma.deviceToken.count({ where: { userId: user.id } });
    if (userTokensCount !== 2) {
      throw new Error(`Expected user to have exactly 2 device tokens, found ${userTokensCount}`);
    }
  });

  await testCase('Delete device token removes record', async () => {
    const { req, res, next, results } = mockRequestResponse(
      { token: 'token-12345' },
      {},
      {},
      user
    );

    await deleteDeviceToken(req, res, next);
    const { statusCode, responseData, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (responseData.deletedCount !== 1) throw new Error('Expected deletedCount to be 1');

    // Verify DB
    const exists = await prisma.deviceToken.findUnique({ where: { token: 'token-12345' } });
    if (exists) throw new Error('Device token should have been deleted');
  });

  await testCase('Invalid token cleanup during PushNotificationService send', async () => {
    // Register an invalid token that contains 'invalid'
    const invalidToken = 'invalid-device-token-xyz';
    await prisma.deviceToken.create({
      data: {
        token: invalidToken,
        userId: user.id,
        platform: 'ios'
      }
    });

    // Send push notification using the service
    await PushNotificationService.sendToUser(user.id, {
      title: 'Cleanup Test',
      body: 'Testing token deletion'
    });

    // Verify the invalid token has been automatically removed from database
    const dbRecord = await prisma.deviceToken.findUnique({ where: { token: invalidToken } });
    if (dbRecord) {
      throw new Error('Invalid device token was not removed from the database during sendToUser');
    }
  });

  await testCase('Test notification endpoint dispatches successfully', async () => {
    const { req, res, next, results } = mockRequestResponse(
      {},
      {},
      {},
      user
    );

    await testPushNotification(req, res, next);
    const { statusCode, responseData, nextError } = results();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (!responseData.message.includes('dispatched successfully')) {
      throw new Error('Unexpected controller response');
    }
  });

  console.log(`\n🎉 FCM integration tests finished: ${passed} passed, ${failed} failed.\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed in FCM integration tests.`);
  }
}
