import { getFileMetadata } from '../src/services/google-drive.service';
import { initializeGoogleDrive } from '../src/services/google-drive.service';

async function main() {
  await initializeGoogleDrive();
  const fileIds = [
    '1TEgHcducOanG3gSlc4QXHfO2Z4A8QmB1',
    '1-u8WArEp69mQsnoBzimFeouz5ysk4Lp7',
    '18v_S6mTRk17SBUD8dGZNi3yGvPunZYRo',
    '1x-cYEXHO_muHVSxJCZSRoO9gIh3_L4KI',
    '1A8bfOmQvz5GIQw64RTUe84IOkI85bnTQ'
  ];

  for (const fileId of fileIds) {
    console.log(`--- Inspecting file ${fileId} ---`);
    try {
      const meta = await getFileMetadata(fileId);
      console.log(meta);
    } catch (err: any) {
      console.error(`Error fetching meta for ${fileId}:`, err.message);
    }
  }
}

main().catch(console.error);
