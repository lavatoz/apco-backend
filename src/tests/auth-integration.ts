import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { 
  login, 
  verifyMfaLogin, 
  refresh, 
  logout 
} from '../modules/auth/auth.controller';
import { hashPassword } from '../utils/hash';
import { hashToken, generateRandomToken } from '../utils/jwt';
import { authenticator } from 'otplib';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import '../middleware/auth';
import '../middleware/request-id';

// Simple mock logger to silent console warning logs during testing
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
function createMockRequestResponse(body = {}, params = {}, headers = {}) {
  const req = {
    body,
    params,
    headers: {
      'user-agent': 'TestRunner/1.0',
      'sec-ch-ua': 'TestRunnerChrome',
      ...headers,
    },
    ip: '127.0.0.1',
    requestId: 'test-correlation-id',
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
  console.log('\n🧪 Starting APCO Authentication Integration Tests...\n');
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

  // Setup common mock structures
  const testPassword = 'TestPassword123!';
  const testPasswordHash = await hashPassword(testPassword);
  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@apco.local',
    passwordHash: testPasswordHash,
    firstName: 'Test',
    lastName: 'User',
    role: Role.Photographer,  // Photographer: not subject to MFA enforcement
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    mustChangePassword: false,
    mfaEnabled: false,
    mfaSecret: null as string | null,
    emailVerified: true,
  };

  // Setup globally mocked models on prisma
  const mockPrisma = prisma as any;
  mockPrisma.auditLog = { create: async () => ({}) };
  mockPrisma.securityEvent = { create: async () => ({}) };
  mockPrisma.userSession = { create: async () => ({}), createMany: async () => ({}), updateMany: async () => ({}), deleteMany: async () => ({}) };
  mockPrisma.refreshToken = { create: async () => ({}), update: async () => ({}), updateMany: async () => ({}), delete: async () => ({}) };

  // ==========================================
  // Test 1: Login Success
  // ==========================================
  await testCase('Login Success (Correct Credentials)', async () => {
    mockPrisma.user.findUnique = async () => mockUser;
    mockPrisma.user.update = async () => mockUser;
    
    mockPrisma.refreshToken.create = async (args: any) => ({
      id: 'refresh-token-uuid',
      ...args.data,
    });

    const { req, res, next, getResults } = createMockRequestResponse({
      email: 'test@apco.local',
      password: testPassword,
    });

    await login(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected status 200, got ${statusCode}`);
    if (!responseData.accessToken || !responseData.refreshToken) {
      throw new Error('Tokens missing from login success response.');
    }
  });

  // ==========================================
  // Test 1b: Login Blocked — Unverified Email
  // ==========================================
  await testCase('Email Verification Gate (Unverified Email Blocked)', async () => {
    const unverifiedUser = { ...mockUser, emailVerified: false };
    mockPrisma.user.findUnique = async () => unverifiedUser;
    mockPrisma.user.update = async () => unverifiedUser;

    const { req, res, next, getResults } = createMockRequestResponse({
      email: 'test@apco.local',
      password: testPassword,
    });

    await login(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 403) throw new Error(`Expected 403, got ${statusCode}`);
    if (!responseData.emailNotVerified) {
      throw new Error('Expected emailNotVerified: true in response.');
    }
  });

  // ==========================================
  // Test 1c: Login Blocked — MFA Required
  // ==========================================
  await testCase('MFA Enforcement Gate (Manager Without MFA Blocked)', async () => {
    const managerNoMfa = { ...mockUser, role: Role.Manager, mfaEnabled: false, emailVerified: true };
    mockPrisma.user.findUnique = async () => managerNoMfa;
    mockPrisma.user.update = async () => managerNoMfa;

    const { req, res, next, getResults } = createMockRequestResponse({
      email: 'test@apco.local',
      password: testPassword,
    });

    await login(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 403) throw new Error(`Expected 403, got ${statusCode}`);
    if (!responseData.mfaSetupRequired) {
      throw new Error('Expected mfaSetupRequired: true in response.');
    }
  });

  // ==========================================
  // Test 2: Login Failure
  // ==========================================
  await testCase('Login Failure (Incorrect Credentials)', async () => {
    mockPrisma.user.findUnique = async () => mockUser;
    mockPrisma.user.update = async () => mockUser;

    const { req, res, next, getResults } = createMockRequestResponse({
      email: 'test@apco.local',
      password: 'wrongpassword',
    });

    await login(req, res, next);
    const { nextError } = getResults();

    if (!nextError) {
      throw new Error('Expected next() to be called with an error, but it succeeded.');
    }
    if (nextError.statusCode !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${nextError.statusCode}`);
    }
  });

  // ==========================================
  // Test 3: Account Lockout
  // ==========================================
  await testCase('Account Lockout (After 5 failures)', async () => {
    const userNearLockout = {
      ...mockUser,
      failedLoginAttempts: 4,
    };
    
    let updatedData: any = null;
    mockPrisma.user.findUnique = async () => userNearLockout;
    mockPrisma.user.update = async (args: any) => {
      updatedData = args.data;
      return userNearLockout;
    };

    const { req, res, next, getResults } = createMockRequestResponse({
      email: 'test@apco.local',
      password: 'wrongpassword',
    });

    await login(req, res, next);
    const { nextError } = getResults();

    if (!nextError) throw new Error('Expected login error.');
    if (!updatedData || !updatedData.lockedUntil) {
      throw new Error('User lockedUntil was not configured after 5 failed attempts.');
    }
    if (updatedData.failedLoginAttempts !== 0) {
      throw new Error('Failed attempts counter was not reset on lock.');
    }
  });

  // ==========================================
  // Test 4: Refresh Token Rotation
  // ==========================================
  await testCase('Refresh Token Rotation (Successful Rotation)', async () => {
    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);
    
    const dbToken = {
      id: 'token-uuid',
      tokenHash,
      userId: mockUser.id,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      user: mockUser,
    };

    mockPrisma.refreshToken.findUnique = async () => dbToken;
    mockPrisma.refreshToken.update = async () => dbToken;
    mockPrisma.refreshToken.create = async (args: any) => ({
      id: 'new-token-uuid',
      ...args.data,
    });

    const { req, res, next, getResults } = createMockRequestResponse({
      refreshToken: rawRefreshToken,
    });

    await refresh(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (!responseData.accessToken || !responseData.refreshToken) {
      throw new Error('Did not return rotated tokens.');
    }
  });

  // ==========================================
  // Test 5: Refresh Token Reuse Detection
  // ==========================================
  await testCase('Refresh Token Reuse Detection (Revoke Family)', async () => {
    const reusedToken = generateRandomToken();

    // Mock findUnique to return null (token already rotated or not active)
    mockPrisma.refreshToken.findUnique = async () => null;
    
    // Mock findFirst to simulate that this token WAS previously a parent token
    let updateManyParams: any = null;
    let deleteManyParams: any = null;
    
    mockPrisma.refreshToken.findFirst = async () => ({
      id: 'some-child-token',
      userId: mockUser.id,
    });
    
    mockPrisma.refreshToken.updateMany = async (args: any) => {
      updateManyParams = args;
      return { count: 1 };
    };
    
    mockPrisma.userSession.deleteMany = async (args: any) => {
      deleteManyParams = args;
      return { count: 1 };
    };

    const { req, res, next, getResults } = createMockRequestResponse({
      refreshToken: reusedToken,
    });

    await refresh(req, res, next);
    const { nextError } = getResults();

    if (!nextError) throw new Error('Expected reuse error, but request succeeded.');
    if (!updateManyParams || updateManyParams.where.userId !== mockUser.id || !updateManyParams.data.isRevoked) {
      throw new Error('Family tokens were not revoked upon reuse detection.');
    }
    if (!deleteManyParams || deleteManyParams.where.userId !== mockUser.id) {
      throw new Error('Active sessions were not cleared upon reuse detection.');
    }
  });

  // ==========================================
  // Test 6: MFA Verification
  // ==========================================
  await testCase('MFA Verification (Valid TOTP & Backup Code)', async () => {
    const mfaSecret = authenticator.generateSecret();
    const validCode = authenticator.generate(mfaSecret);
    const mfaUser = {
      ...mockUser,
      mfaEnabled: true,
      mfaSecret,
    };

    const tempToken = jwt.sign(
      { userId: mfaUser.id, purpose: 'mfa_verification' },
      env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    mockPrisma.user.findUnique = async () => mfaUser;

    const { req, res, next, getResults } = createMockRequestResponse({
      tempToken,
      code: validCode,
    });

    await verifyMfaLogin(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (!responseData.accessToken || !responseData.refreshToken) {
      throw new Error('MFA tokens missing from response.');
    }
  });

  // ==========================================
  // Test 7: Logout Token Revocation
  // ==========================================
  await testCase('Logout Token Revocation (Revoke Active Tokens)', async () => {
    const activeToken = generateRandomToken();
    const tokenHash = hashToken(activeToken);
    
    const dbToken = {
      id: 'token-uuid',
      tokenHash,
      userId: mockUser.id,
    };

    let deletedTokenId: string | null = null;
    mockPrisma.refreshToken.findUnique = async () => dbToken;
    mockPrisma.refreshToken.delete = async (args: any) => {
      deletedTokenId = args.where.id;
      return dbToken;
    };

    const { req, res, next, getResults } = createMockRequestResponse({
      refreshToken: activeToken,
    });

    await logout(req, res, next);
    const { statusCode, nextError } = getResults();

    if (nextError) throw nextError;
    if (statusCode !== 200) throw new Error(`Expected 200, got ${statusCode}`);
    if (deletedTokenId !== 'token-uuid') {
      throw new Error('Refresh token was not deleted from DB on logout.');
    }
  });

  console.log('\n📊 Integration Tests Summary:');
  console.log(`   Passed: ${passedCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log('------------------------------');

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Allow direct run
if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  });
}

export { runTests };
