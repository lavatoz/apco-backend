import '../src/middleware/auth';
import '../src/middleware/request-id';
import { Request, Response } from 'express';
import { updateUser } from '../src/modules/users/users.controller';
import { prisma } from '../src/config/database';
import { Role } from '@prisma/client';

async function testUpdate() {
  const adminUser = await prisma.user.findFirst({
    where: { role: Role.SystemAdmin }
  });

  if (!adminUser) {
    console.error('No Admin User found in DB.');
    return;
  }

  console.log('Found Admin User:', adminUser);

  // Simulate updating email to a duplicate email
  const req = {
    params: { id: adminUser.id },
    user: adminUser, // requestingUser is the admin themselves
    headers: {
      'user-agent': 'TestAgent',
      'x-forwarded-for': '127.0.0.1'
    },
    ip: '127.0.0.1',
    body: {
      email: 'gallery-staff@example.com', // Duplicate email
      firstName: 'System',
      lastName: 'Admin',
    },
    requestId: 'test-req-id',
  } as unknown as Request;

  let statusCode = 200;
  let responseData: any = null;

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

  const next = (err: any) => {
    console.log('next() called with error:');
    console.log('Error Class:', err.constructor.name);
    console.log('Error Code:', err.code);
    console.log('Error Meta:', err.meta);
    console.log('Error Message:', err.message);
  };

  try {
    console.log('Calling updateUser...');
    await updateUser(req, res, next);
    console.log('Response Status:', statusCode);
    console.log('Response Data:', responseData);
  } catch (error) {
    console.error('Unhandled error in test runner:', error);
  }
}

testUpdate().finally(async () => {
  await prisma.$disconnect();
});
