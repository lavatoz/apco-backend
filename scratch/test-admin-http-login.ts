import app from '../src/app';
import argon2 from 'argon2';
import { prisma } from '../src/config/database';
import http from 'http';

async function verifyLogin() {
  console.log('🧪 Verifying Admin Login Flow...');

  // 1. Direct Argon2 check
  const user = await prisma.user.findUnique({
    where: { email: 'admin@apco.local' },
  });

  if (!user || !user.passwordHash) {
    console.error('❌ User admin@apco.local not found in DB!');
    process.exit(1);
  }

  const isHashValid = await argon2.verify(user.passwordHash, 'AdminApcoPassword@123!');
  console.log('1. Direct argon2.verify(user.passwordHash, "AdminApcoPassword@123!"):', isHashValid);

  // 2. Start temporary HTTP server on port 3099 and send HTTP POST /api/auth/login
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3099, resolve));

  try {
    const res = await fetch('http://localhost:3099/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@apco.local',
        password: 'AdminApcoPassword@123!',
      }),
    });

    const body = await res.json();
    console.log('2. HTTP POST http://localhost:3099/api/auth/login Status:', res.status);
    console.log('3. HTTP Response Body:', body);

    if (res.status === 200 && body.accessToken) {
      console.log('🎉 ADMIN LOGIN SUCCEEDED 100% via HTTP endpoint!');
    } else {
      console.error('❌ Login failed with status:', res.status);
    }
  } catch (err: any) {
    console.error('HTTP fetch error:', err.message);
  } finally {
    server.close();
  }

  process.exit(0);
}

verifyLogin().catch((err) => {
  console.error(err);
  process.exit(1);
});
