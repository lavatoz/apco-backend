const fs = require('fs');

const content = fs.readFileSync('src/services/default-logo.ts', 'utf8');
const tinyMatch = content.match(/export const tinyToesLogoBase64\s*=\s*\"([^\"]+)\"/);
const aahaMatch = content.match(/export const aahaLogoBase64\s*=\s*\"([^\"]+)\"/);

const blackLogoBuffer = fs.readFileSync('C:/Users/joeln/.gemini/antigravity-ide/brain/cfca8c59-b337-42a4-9976-ff2b0606d92f/media__1783361779690.png');
const blackLogoBase64 = 'data:image/png;base64,' + blackLogoBuffer.toString('base64');

console.log('Tiny Toes match length:', tinyMatch ? tinyMatch[1].length : 'not found');
console.log('Aaha Kalyanam match length:', aahaMatch ? aahaMatch[1].length : 'not found');
console.log('Expected black logo base64 length:', blackLogoBase64.length);
console.log('Does Tiny Toes match black logo?', tinyMatch && tinyMatch[1] === blackLogoBase64);
