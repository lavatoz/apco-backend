import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config/database';
import { deleteFile } from '../services/google-drive.service';

async function main() {
  console.log('🧹 Starting historical Position 5 division media cleanup...');
  
  try {
    // 1. Find all DivisionMedia records with position = 5
    const pos5Items = await prisma.divisionMedia.findMany({
      where: { position: 5 }
    });

    console.log(`Found ${pos5Items.length} records matching Position 5.`);
    let filesDeleted = 0;
    let dbRecordsDeleted = 0;

    for (const item of pos5Items) {
      // 2. Delete database record
      await prisma.divisionMedia.delete({
        where: { id: item.id }
      });
      dbRecordsDeleted++;

      // 3. Check if file is orphaned (no other division media references it)
      if (item.fileId) {
        const count = await prisma.divisionMedia.count({
          where: { fileId: item.fileId }
        });
        if (count === 0) {
          try {
            await deleteFile(item.fileId);
            filesDeleted++;
            console.log(`Deleted orphaned Google Drive file: ${item.fileId}`);
          } catch (driveErr: any) {
            console.error(`Failed to delete Google Drive file ${item.fileId}:`, driveErr.message || driveErr);
          }
        }
      }
    }

    console.log('\n======================================');
    console.log('🎉 Cleanup summary:');
    console.log(`- Database records removed: ${dbRecordsDeleted}`);
    console.log(`- Google Drive files deleted: ${filesDeleted}`);
    console.log('======================================');

  } catch (error: any) {
    console.error('❌ Error during cleanup:', error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
