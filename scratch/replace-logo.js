const fs = require('fs');
const path = require('path');

const newLogoPath = 'C:/Users/joeln/.gemini/antigravity-ide/brain/cfca8c59-b337-42a4-9976-ff2b0606d92f/media__1783361779690.png';
const templateLogoPath = 'src/templates/logo.png';
const defaultLogoTsPath = 'src/services/default-logo.ts';

// 1. Copy the file to src/templates/logo.png
fs.copyFileSync(newLogoPath, templateLogoPath);
console.log(`Copied new logo to ${templateLogoPath}`);

// 2. Read the new logo as Base64
const logoBuffer = fs.readFileSync(newLogoPath);
const newLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
console.log('Generated new Base64 string for the black logo');

// 3. Read the existing default-logo.ts to extract apcoFooterBase64
const defaultLogoContent = fs.readFileSync(defaultLogoTsPath, 'utf8');

// Match apcoFooterBase64 regardless of double or single quotes
const footerMatch = defaultLogoContent.match(/export const apcoFooterBase64\s*=\s*(["'])(.*?)\1/s);

if (!footerMatch) {
  throw new Error('Could not find apcoFooterBase64 in default-logo.ts');
}

const footerBase64Val = footerMatch[2];
console.log(`Found apcoFooterBase64, length: ${footerBase64Val.length}`);

// 4. Construct and write the new default-logo.ts content
const newContent = `// Auto-generated logo asset module
export const aahaLogoBase64 = "${newLogoBase64}";
export const tinyToesLogoBase64 = "${newLogoBase64}";
export const apcoFooterBase64 = "${footerBase64Val}";
`;

fs.writeFileSync(defaultLogoTsPath, newContent, 'utf8');
console.log('Successfully updated default-logo.ts with the new black logo base64 strings');
