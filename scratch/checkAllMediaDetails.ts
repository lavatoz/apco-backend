import { getFileMetadata } from '../src/services/google-drive.service';
import { initializeGoogleDrive } from '../src/services/google-drive.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await initializeGoogleDrive();
  
  const media = await prisma.divisionMedia.findMany();
  console.log(`Checking ${media.length} media files currently registered in the DB:`);

  for (const item of media) {
    console.log(`\n--- DB Item: ${item.type} | Position: ${item.position} | ID: ${item.fileId} ---`);
    try {
      const meta = await getFileMetadata(item.fileId);
      console.log(`Drive File Name: "${meta.name}"`);
      console.log(`MimeType: ${meta.mimeType}`);
      console.log(`Size: ${meta.size} bytes`);
    } catch (err: any) {
      console.error(`Error fetching drive file:`, err.message);
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
