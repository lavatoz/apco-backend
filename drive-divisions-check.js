const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const env = process.env;

function getDriveClient() {
  if (
    env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_ID.trim() !== '' &&
    env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_CLIENT_SECRET.trim() !== '' &&
    env.GOOGLE_DRIVE_REFRESH_TOKEN && env.GOOGLE_DRIVE_REFRESH_TOKEN.trim() !== ''
  ) {
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_DRIVE_CLIENT_ID.trim(),
      env.GOOGLE_DRIVE_CLIENT_SECRET.trim()
    );
    oauth2Client.setCredentials({
      refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN.trim(),
    });
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  let auth;
  if (env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON && env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.trim() !== '') {
    const credentials = JSON.parse(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else if (env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH.trim() !== '') {
    const keyPath = path.resolve(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
    auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else {
    throw new Error('Credentials not configured');
  }
  return google.drive({ version: 'v3', auth });
}

async function checkFile(drive, fileId) {
  try {
    const fileRes = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, permissions, webViewLink, webContentLink, thumbnailLink',
    });
    const file = fileRes.data;
    console.log(`\n[File] Name: "${file.name}" (ID: ${file.id})`);
    console.log(`     MimeType: ${file.mimeType}`);
    console.log(`     Permissions: ${JSON.stringify(file.permissions)}`);
    
    const isPublic = file.permissions && file.permissions.some(p => p.type === 'anyone' && p.role === 'reader');
    console.log(`     Is Public? ${isPublic ? 'YES' : 'NO'}`);

    const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    try {
      const response = await fetch(directUrl, { method: 'GET' });
      console.log(`     [HTTP test] Direct URL (${directUrl}) -> Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
    } catch (fetchErr) {
      console.log(`     [HTTP test] Direct URL failed: ${fetchErr.message}`);
    }
  } catch (err) {
    console.error(`Error checking file ${fileId}:`, err.message);
  }
}

async function main() {
  const drive = getDriveClient();
  const fileIds = [
    '1TEgHcducOanG3gSlc4QXHfO2Z4A8QmB1',
    '1-u8WArEp69mQsnoBzimFeouz5ysk4Lp7',
    '18v_S6mTRk17SBUD8dGZNi3yGvPunZYRo',
    '1x-cYEXHO_muHVSxJCZSRoO9gIh3_L4KI',
    '1A8bfOmQvz5GIQw64RTUe84IOkI85bnTQ'
  ];

  for (const fileId of fileIds) {
    await checkFile(drive, fileId);
  }
}

main().catch(err => {
  console.error(err);
});
