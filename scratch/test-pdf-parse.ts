import * as fs from 'fs';
import * as path from 'path';
const pdf = require('pdf-parse');

async function testPdfParse() {
  const pdfPath = path.resolve(process.cwd(), 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0001_rohit.pdf');
  console.log(`🔍 Reading PDF file: ${pdfPath}`);

  if (!fs.existsSync(pdfPath)) {
    console.error('❌ PDF file does not exist.');
    return;
  }

  const dataBuffer = fs.readFileSync(pdfPath);

  console.log('\n1️⃣  Attempting to parse PDF without a password (using options object)...');
  try {
    const parsed = new pdf.PDFParse({ data: dataBuffer });
    const textObj = await parsed.getText();
    console.log('❌ SUCCESS (Oh no!): Loaded PDF successfully without a password!');
    console.log(`   Text snippet: ${textObj.text?.substring(0, 100).replace(/\n/g, ' ')}`);
  } catch (err: any) {
    console.log('✅ SUCCESS (Oh yes!): Correctly threw an error trying to read protected PDF.');
    console.log('   Error name/message:', err.name || 'Error', '-', err.message || err);
  }

  console.log('\n2️⃣  Attempting to parse PDF with correct password "UserPass123"...');
  try {
    const parsed = new pdf.PDFParse({ data: dataBuffer, password: 'UserPass123' });
    const textObj = await parsed.getText();
    console.log('✅ SUCCESS: Loaded PDF successfully with "UserPass123"!');
    console.log(`   Text snippet length: ${textObj.text?.length} characters`);
    console.log(`   Text snippet: ${textObj.text?.substring(0, 150).replace(/\n/g, ' ').trim()}`);
  } catch (err: any) {
    console.log('❌ FAILURE: Could not open PDF with password "UserPass123". Error:', err.message || err);
  }

  console.log('\n3️⃣  Attempting to parse PDF with incorrect password "WrongPass"...');
  try {
    const parsed = new pdf.PDFParse({ data: dataBuffer, password: 'WrongPass' });
    await parsed.getText();
    console.log('❌ FAILURE: PDF opened with an incorrect password!');
  } catch (err: any) {
    console.log('✅ SUCCESS: PDF correctly rejected the incorrect password.');
    console.log('   Error name/message:', err.name || 'Error', '-', err.message || err);
  }
}

testPdfParse().catch(console.error);
