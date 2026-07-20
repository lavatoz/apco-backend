import fs from 'fs';
import path from 'path';

function inspectInvalidObject() {
  const p = path.resolve(process.cwd(), 'scratch/quotation_aes256.pdf');
  const buffer = fs.readFileSync(p);
  const text = buffer.toString('binary');
  const lines = text.split(/\r?\n/);

  console.log(`Total Lines in quotation_aes256.pdf: ${lines.length}`);
  console.log('=== FIRST 30 LINES ===');
  console.log(lines.slice(0, 30).join('\n'));

  console.log('\n=== LINES 815 to 835 ===');
  console.log(lines.slice(815, 835).join('\n'));
}

inspectInvalidObject();
