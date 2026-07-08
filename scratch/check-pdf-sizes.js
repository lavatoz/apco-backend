const fs = require('fs');
const path = require('path');

const testPdfSize = fs.statSync('scratch/test-quote.pdf').size;
console.log('scratch/test-quote.pdf size:', testPdfSize, 'bytes');

const uploadsDir = 'uploads/quotations/pdfs';
if (fs.existsSync(uploadsDir)) {
  const files = fs.readdirSync(uploadsDir);
  files.forEach(f => {
    const fullPath = path.join(uploadsDir, f);
    console.log(`${f} size:`, fs.statSync(fullPath).size, 'bytes');
  });
}
