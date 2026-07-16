import { Request, Response } from 'express';
import '../src/middleware/auth';
import '../src/middleware/request-id';
import { login } from '../src/modules/auth/auth.controller';
import { prisma } from '../src/config/database';

// Helper to create mocked Request & Response objects
function createMockRequestResponse(body = {}) {
  const req = {
    body,
    headers: {
      'user-agent': 'LocalTestRunner/1.0',
    },
    ip: '127.0.0.1',
    requestId: 'test-correlation-id-local',
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

async function testAdminLogin() {
  console.log('🧪 Testing local admin login via auth controller...');

  const { req, res, next, getResults } = createMockRequestResponse({
    email: 'admin@apco.local',
    password: 'Admin@123',
  });

  try {
    await login(req, res, next);
    const { statusCode, responseData, nextError } = getResults();

    if (nextError) {
      console.error('❌ Login failed with error handled by Express next():', nextError);
      process.exit(1);
    }

    if (statusCode !== 200) {
      console.error(`❌ Expected status 200, got ${statusCode}. Response data:`, responseData);
      process.exit(1);
    }

    if (!responseData || !responseData.accessToken || !responseData.refreshToken) {
      console.error('❌ Access token or refresh token is missing from the login response:', responseData);
      process.exit(1);
    }

    console.log('✅ Local authentication test succeeded!');
    console.log('Login Response:');
    console.log({
      accessTokenExists: !!responseData.accessToken,
      refreshTokenExists: !!responseData.refreshToken,
      mustChangePassword: responseData.mustChangePassword,
    });
  } catch (error) {
    console.error('❌ Exception occurred during local login test:', error);
    process.exit(1);
  }
}

testAdminLogin()
  .catch((err) => {
    console.error('Test runner failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
