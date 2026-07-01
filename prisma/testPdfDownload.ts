import fs from 'fs';
const pdfParse = require('pdf-parse');

async function verify() {
  console.log('1. Logging in as client bro@gmail.com...');
  let token = '';
  try {
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bro@gmail.com',
        password: '123456'
      })
    });
    
    if (!loginRes.ok) {
      console.error(`Login failed with status ${loginRes.status}`);
      const errText = await loginRes.text();
      console.error('Error details:', errText);
      return;
    }
    
    const loginJson: any = await loginRes.json();
    token = loginJson.accessToken;
    console.log('✅ Logged in successfully. Token received.');
  } catch (error: any) {
    console.error('❌ Error logging in:', error.message);
    return;
  }

  const agreementId = 'e76653d7-90cc-478f-9264-3725e93194ef';
  const pdfUrl = `http://localhost:3000/api/standalone-agreements/${agreementId}/pdf`;
  console.log(`2. Requesting PDF via: ${pdfUrl}`);
  
  try {
    const pdfRes = await fetch(pdfUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!pdfRes.ok) {
      console.error(`❌ PDF Request failed with status ${pdfRes.status}`);
      const errText = await pdfRes.text();
      console.error('Error details:', errText);
      return;
    }

    const contentDisposition = pdfRes.headers.get('content-disposition') || '';
    const contentType = pdfRes.headers.get('content-type') || '';
    console.log(`✅ PDF Request successful.`);
    console.log(`- Content-Type: ${contentType}`);
    console.log(`- Content-Disposition: ${contentDisposition}`);

    const arrayBuffer = await pdfRes.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    
    // Save to temp file
    const targetPath = 'C:/Users/joeln/.gemini/antigravity-ide/scratch/temp_downloaded_agreement.pdf';
    fs.writeFileSync(targetPath, pdfBuffer);
    console.log(`✅ Saved PDF to: ${targetPath}`);

    // Parse PDF text using pdf-parse
    console.log('3. Parsing PDF text with pdf-parse...');
    const parser = new pdfParse.PDFParse({ data: pdfBuffer });
    const parsedData = await parser.getText();
    const pdfText = typeof parsedData === 'string' ? parsedData : (parsedData.text || '');

    const marker = 'DEBUG BUILD: BACKEND_STANDALONE_2026-06-25 18:45';
    const hasMarker = pdfText.includes(marker);
    console.log(`Checking for marker: "${marker}"`);
    if (hasMarker) {
      console.log('🎉 SUCCESS! The marker was successfully found in the parsed PDF text!');
    } else {
      console.log('❌ FAILURE! The marker was NOT found in the parsed PDF text.');
      console.log('Parsed PDF Text preview (first 1000 chars):');
      console.log(pdfText.slice(0, 1000));
    }
  } catch (error: any) {
    console.error('❌ Error requesting/parsing PDF:', error.message);
  }
}

verify();
