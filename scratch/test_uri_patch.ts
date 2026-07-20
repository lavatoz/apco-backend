import { PDFDocument, PDFName, PDFArray, PDFRef } from 'pdf-lib';
import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import { DocumentRegistryService } from '../src/services/document-registry.service';

export function preserveUriAnnotations(pdfBuffer: Buffer, uriList: string[]): Buffer {
  let binaryStr = pdfBuffer.toString('binary');
  
  for (const uri of uriList) {
    if (!binaryStr.includes(uri)) {
      const uriRegex = /\/S\s*\/URI\s*\/URI\s*\((?:[^()\\]|\\.)*\)/g;
      binaryStr = binaryStr.replace(uriRegex, `/S /URI /URI (${uri})`);
    }
  }

  return Buffer.from(binaryStr, 'binary');
}

async function runTest() {
  console.log('🧪 Testing preserveUriAnnotations on generated PDF...\n');

  const quotDocId = 'AK-DOC-2026-000009';
  const verificationUrl = DocumentRegistryService.getVerificationUrl(quotDocId);

  const pdfBuffer = await generateQuotationPdf({
    quotationNumber: 'AK-QUO-2026-0004',
    issueDate: '2026-07-20',
    validUntil: '2026-08-20',
    clientName: 'rohit',
    clientEmail: 'rohit@example.com',
    items: [{ description: 'Photo Service', quantity: 1, unitPrice: 50000, amount: 50000 }],
    amount: 50000,
    advancePaid: 20000,
    balanceAmount: 30000,
    companyName: 'Aaha Kalyanam',
    verificationUrl,
  });

  const patchedBuffer = preserveUriAnnotations(pdfBuffer, [verificationUrl]);
  const hasPlaintextUrl = patchedBuffer.toString('binary').includes(verificationUrl);

  console.log(`Patched Buffer size: ${patchedBuffer.length} bytes`);
  console.log(`Contains Plaintext Verification URL after patch? ${hasPlaintextUrl}`);

  const doc = await PDFDocument.load(patchedBuffer, { ignoreEncryption: true });
  const p = doc.getPages()[0];
  const annots = p.node.lookup(PDFName.of('Annots'), PDFArray);
  if (annots && annots.size() > 0) {
    let annotRef = annots.get(0);
    let annotObj: any = doc.context.lookup(annotRef);
    while (annotObj instanceof PDFRef) annotObj = doc.context.lookup(annotObj);
    
    let actionRef = annotObj.get(PDFName.of('A'));
    let actionObj: any = doc.context.lookup(actionRef);
    while (actionObj instanceof PDFRef) actionObj = doc.context.lookup(actionObj);

    const uriStr = actionObj.get(PDFName.of('URI'))?.toString();
    console.log(`Parsed URI String in PDF Annotation: ${uriStr}`);
    if (uriStr === `(${verificationUrl})`) {
      console.log('🎉 PERFECT! Link Annotation URI is 100% valid plaintext URL!');
    }
  }
}

runTest().catch(console.error);
