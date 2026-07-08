const { execSync } = require('child_process');
const fs = require('fs');

// 1. Revert templates/logo.png and services/default-logo.ts to the clean git HEAD versions
console.log('Reverting default-logo.ts and logo.png to HEAD...');
execSync('git checkout HEAD -- src/templates/logo.png src/services/default-logo.ts');

// 2. Read the new black logo as base64
const newLogoPath = 'C:/Users/joeln/.gemini/antigravity-ide/brain/cfca8c59-b337-42a4-9976-ff2b0606d92f/media__1783361779690.png';
const logoBuffer = fs.readFileSync(newLogoPath);
const newLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
console.log('Read and encoded new black Tiny Toes logo');

// 3. Read the reverted default-logo.ts
const defaultLogoTsPath = 'src/services/default-logo.ts';
let content = fs.readFileSync(defaultLogoTsPath, 'utf8');

// 4. Replace tinyToesLogoBase64 with the new black Tiny Toes logo
// Using a regex to replace only tinyToesLogoBase64
const regex = /(export const tinyToesLogoBase64\s*=\s*)(["'])(.*?)\2/s;
if (!regex.test(content)) {
  throw new Error('Could not match export const tinyToesLogoBase64 in default-logo.ts');
}

content = content.replace(regex, `$1"${newLogoBase64}"`);
fs.writeFileSync(defaultLogoTsPath, content, 'utf8');
console.log('Successfully updated tinyToesLogoBase64 in default-logo.ts while preserving others');
