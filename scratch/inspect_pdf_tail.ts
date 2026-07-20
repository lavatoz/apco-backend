import fs from 'fs';
import path from 'path';

function inspectTail() {
  const p = path.resolve(process.cwd(), 'scratch/test_generated_quotation.pdf');
  const buffer = fs.readFileSync(p);
  const tail = buffer.slice(-300).toString('binary');

  console.log('=== TAIL 300 BYTES OF GENERATED PDF ===');
  console.log(tail);
  console.log(`\nTotal File Length: ${buffer.length} bytes`);
  
  const startXrefPos = buffer.lastIndexOf(Buffer.from('startxref'));
  console.log(`Position of 'startxref' in buffer: ${startXrefPos}`);

  const numberStr = tail.match(/startxref\s*(\d+)\s*%%EOF/);
  if (numberStr) {
    const val = parseInt(numberStr[1], 10);
    console.log(`Parsed startxref value in PDF trailer: ${val}`);
    console.log(`Difference (Buffer Length - startxref val): ${buffer.length - val} bytes`);
  }
}

inspectTail();
