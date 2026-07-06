import { NotificationService } from '../src/services/notification.service';
import { prisma } from '../src/config/database';

async function main() {
  console.log('Finding an active user...');
  const user = await prisma.user.findFirst({
    where: { status: 'Active' },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error('No active user found.');
    return;
  }

  // We use a mock token that doesn't contain 'invalid' or 'unregistered' so it returns SUCCESS in mock mode!
  // Wait, let's look at push-notification.service.ts or firebase-admin.service.ts mock behavior:
  // if token doesn't include 'invalid' or 'unregistered', it succeeds!
  const mockToken = 'valid-mock-token-for-testing';
  console.log(`Registering mock token for user: ${user.email} (${user.id})...`);
  await prisma.deviceToken.upsert({
    where: { token: mockToken },
    update: { userId: user.id, lastUsedAt: new Date() },
    create: {
      token: mockToken,
      userId: user.id,
      platform: 'web',
      deviceId: 'test-device-id'
    }
  });

  console.log(`Emitting notification to user...`);
  await NotificationService.emitNotification(user.id, {
    title: 'Integrated Push Notification Test',
    message: 'Testing complete pipeline with mock token registered.',
    metadata: { route: '/dashboard', priority: 'high' }
  });

  console.log('Cleaning up mock token safely...');
  await prisma.deviceToken.deleteMany({
    where: { token: mockToken }
  });

  console.log('Finished.');
}

main();
