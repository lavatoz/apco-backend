import { NotificationService } from '../src/services/notification.service';
import { prisma } from '../src/config/database';

async function main() {
  console.log('Finding an active user...');
  const user = await prisma.user.findFirst({
    where: { status: 'Active' },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error('No active user found in the DB.');
    return;
  }

  console.log(`Emitting notification to user: ${user.email} (${user.id})`);
  const result = await NotificationService.emitNotification(user.id, {
    title: 'Test Delivery Pipeline',
    message: 'Checking if push notifications are dispatched.',
    metadata: { key1: 'value1', key2: 12345 }
  });

  console.log('Result of emitNotification (DB notification created):', result);
  console.log('Finished. Check console logs above for any FCM/mock logs.');
}

main();
