import { generateQuotationPdfController } from '../src/modules/invoices/invoices.controller';
import { prisma } from '../src/config/database';
import { PDFDocument, PDFName, PDFArray, PDFRef, PDFDict } from 'pdf-lib';

async function verifyFinalPdfLink() {
  console.log('🚀 Step 1: Finding an existing Quotation & Admin User...');

  const quotation = await prisma.quotation.findFirst({
    include: { client: true, project: true }
  });

  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['SystemAdmin', 'Manager'] } }
  });

  if (!quotation || !adminUser) {
    throw new Error('Test prerequisite failed: Quotation or Admin User not found in DB.');
  }

  // Mock Request & Response for generateQuotationPdfController
  const req: any = {
    params: { id: quotation.id },
    user: adminUser,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' }
  };

  let generatedBuffer: any = null;
  let statusCode = 0;

  const res: any = {
    setHeader: () => res,
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    send: (data: any) => {
      generatedBuffer = data;
      return res;
    },
    json: (data: any) => {
      generatedBuffer = data;
      return res;
    }
  };

  const next = (err?: any) => {
    if (err) throw err;
  };

  console.log('\n📄 Step 2: Generating real secured PDF via generateQuotationPdfController...');
  await generateQuotationPdfController(req, res, next);
  const bufLen = generatedBuffer ? (generatedBuffer as Buffer).length : 0;
  console.log(`PDF Generation finished with status ${statusCode}, Buffer size: ${bufLen} bytes`);

  if (!generatedBuffer) {
    throw new Error('No PDF buffer returned by controller.');
  }

  // Step 3: Inspect the final encrypted PDF using pdf-lib
  console.log('\n🔍 Step 3: Inspecting PDF /Annots structure of the final encrypted PDF...');
  const pdfDoc = await PDFDocument.load(generatedBuffer as Buffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  console.log(`Total Pages in PDF: ${pages.length}`);

  let foundLinkAnnot = false;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);

    if (annots) {
      for (let i = 0; i < annots.size(); i++) {
        let annotRef = annots.get(i);
        let annotObj: any = pdfDoc.context.lookup(annotRef);
        while (annotObj instanceof PDFRef) annotObj = pdfDoc.context.lookup(annotObj);

        if (annotObj && annotObj instanceof PDFDict) {
          const subtype = annotObj.get(PDFName.of('Subtype'))?.toString();
          const rect = annotObj.get(PDFName.of('Rect'))?.toString();
          const quadPoints = annotObj.get(PDFName.of('QuadPoints'))?.toString();
          const flags = annotObj.get(PDFName.of('F'))?.toString();
          let actionRef = annotObj.get(PDFName.of('A'));

          let uriAction = 'None';
          if (actionRef) {
            let actionObj: any = pdfDoc.context.lookup(actionRef);
            while (actionObj instanceof PDFRef) actionObj = pdfDoc.context.lookup(actionObj);
            if (actionObj && actionObj instanceof PDFDict) {
              uriAction = actionObj.get(PDFName.of('URI'))?.toString() || '';
            }
          }

          console.log(`\n  Page ${pageIdx + 1} Annotation #${i + 1}:`);
          console.log(`    - Subtype: ${subtype}`);
          console.log(`    - Rect: ${rect}`);
          console.log(`    - QuadPoints: ${quadPoints}`);
          console.log(`    - Flags (F): ${flags}`);
          console.log(`    - URI Action: ${uriAction}`);

          if (subtype === '/Link' && uriAction.includes('https://verify.artisains.com/verify/')) {
            foundLinkAnnot = true;
          }
        }
      }
    }
  }

  console.log('\n========================================');
  if (foundLinkAnnot) {
    console.log('🎉 SUCCESS! Final encrypted PDF contains valid, clickable Link Annotation with plaintext URL!');
  } else {
    console.error('❌ FAILED: Valid Link Annotation was not found in final PDF.');
    process.exit(1);
  }
}

verifyFinalPdfLink().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
