import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

async function verify() {
  const pdfPath = path.resolve(process.cwd(), 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0001_rohit.pdf');
  console.log(`🔍 Reading generated PDF from: ${pdfPath}`);

  if (!fs.existsSync(pdfPath)) {
    console.error('❌ Generated PDF file does not exist on disk.');
    return;
  }

  const bytes = fs.readFileSync(pdfPath);

  console.log('\n1️⃣  Attempting to load PDF without any password...');
  try {
    await PDFDocument.load(bytes);
    console.log('❌ FAILURE: PDF opened successfully without any password prompt!');
  } catch (err: any) {
    console.log('✅ SUCCESS: PDF correctly blocked opening without a password.');
    console.log(`   Error reported: ${err.message}`);
  }

  console.log('\n2️⃣  Attempting to load PDF with correct password "UserPass123"...');
  try {
    const doc = await PDFDocument.load(bytes, { password: 'UserPass123' });
    console.log('✅ SUCCESS: PDF opened successfully with the correct password "UserPass123"!');
    console.log(`   Page count: ${doc.getPageCount()}`);
  } catch (err: any) {
    console.log(`❌ FAILURE: PDF failed to open with correct password "UserPass123". Error: ${err.message}`);
  }

  console.log('\n3️⃣  Attempting to load PDF with incorrect password "WrongPass"...');
  try {
    await PDFDocument.load(bytes, { password: 'WrongPass' });
    console.log('❌ FAILURE: PDF opened with an incorrect password!');
  } catch (err: any) {
    console.log('✅ SUCCESS: PDF correctly rejected the incorrect password.');
    console.log(`   Error reported: ${err.message}`);
  }
}

verify().catch(console.error);
