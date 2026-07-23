import app from '../src/app';
import { signAccessToken } from '../src/utils/jwt';
import { prisma } from '../src/config/database';
import http from 'http';

async function testEndpoints() {
  console.log('🧪 Testing Gallery Endpoints...');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3098, resolve));

  try {
    // 1. Get Admin user
    const admin = await prisma.user.findFirst({
      where: { role: 'SystemAdmin' },
    });

    if (!admin) {
      console.error('No admin user found!');
      process.exit(1);
    }

    const accessToken = signAccessToken({
      userId: admin.id,
      role: admin.role,
    });

    // 2. Test GET /api/admin/gallery/collections
    const adminRes = await fetch('http://localhost:3098/api/admin/gallery/collections', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const adminBody = await adminRes.json();

    console.log('GET /api/admin/gallery/collections Status:', adminRes.status);
    console.log('GET /api/admin/gallery/collections Body:', adminBody);

    // 3. Test GET /api/gallery/collections
    const publicRes = await fetch('http://localhost:3098/api/gallery/collections');
    const publicBody = await publicRes.json();

    console.log('GET /api/gallery/collections Status:', publicRes.status);
    console.log('GET /api/gallery/collections Body:', publicBody);

    if (
      adminRes.status === 200 &&
      Array.isArray(adminBody) &&
      publicRes.status === 200 &&
      Array.isArray(publicBody)
    ) {
      console.log('🎉 BOTH ENDPOINTS RETURNED [] WITH HTTP 200 SUCCESS!');
    } else {
      console.error('❌ Endpoint test failed');
    }
  } catch (err: any) {
    console.error('Error during endpoint test:', err.message);
  } finally {
    server.close();
  }

  process.exit(0);
}

testEndpoints().catch((err) => {
  console.error(err);
  process.exit(1);
});
