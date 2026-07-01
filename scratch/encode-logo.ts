import fs from 'fs';

function main() {
  const filePath = 'C:\\Users\\joeln\\.gemini\\antigravity-ide\\brain\\da2ca056-1c77-4f2a-b5d1-e5d27170ab1f\\media__1782397233498.png';
  if (!fs.existsSync(filePath)) {
    console.error('File not found at:', filePath);
    return;
  }
  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');
  console.log('Base64 Length:', base64.length);
  console.log('Base64 Preview:', base64.substring(0, 100));
  // Write the base64 to a scratch file so we can copy it easily
  fs.writeFileSync('scratch/logo-base64.txt', base64);
  console.log('Written to scratch/logo-base64.txt');
}

main();
