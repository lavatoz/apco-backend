import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { prisma } from '../src/config/database';
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';

const { generateQuotationPdfController } = require('../dist/modules/invoices/invoices.controller');

async function simulateRequest() {
  console.log('🏁 Simulating frontend PDF generation request with a real user...');

  // Fetch a valid user to bypass audit log foreign key checks
  const user = await prisma.user.findFirst();
  const quotation = await prisma.quotation.findFirst({
    include: { client: true, project: true }
  });

  if (!user || !quotation) {
    console.error('❌ Required data (User/Quotation) missing in database to run simulation.');
    return;
  }

  console.log(`👤 Using user ID: ${user.id} (forced role SystemAdmin for RBAC bypass)`);
  console.log(`📄 Using quotation: ID ${quotation.id}, Code ${quotation.quotationCode}`);

  // Get current database settings for PDF encryption
  const initialSetting = await prisma.globalSetting.findFirst({
    where: { key: 'pdfOwnerPassword' }
  });
  const initialOwnerPassword = initialSetting?.value;
  console.log(`Initial pdfOwnerPassword: "${initialOwnerPassword}"`);

  // Temporarily disable encryption for verification loading
  console.log('Temporarily disabling PDF encryption for link inspection...');
  await prisma.globalSetting.upsert({
    where: { key: 'pdfOwnerPassword' },
    update: { value: '' },
    create: { key: 'pdfOwnerPassword', value: '' }
  });

  try {
    const req = {
      params: { id: quotation.id },
      body: {},
      user: { id: user.id, role: 'SystemAdmin' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Test/1.0' },
    } as unknown as Request;

    const res = {
      status: (code: number) => {
        console.log(`📥 HTTP Response Status: ${code}`);
        return res;
      },
      json: () => {
        console.log('📥 HTTP Response JSON received.');
        return res;
      }
    } as unknown as Response;

    const next = (err: any) => {
      if (err) console.error('❌ Controller Error:', err);
    };

    // Run the controller to generate an unencrypted PDF
    await generateQuotationPdfController(req, res, next);

    // Verify the output PDF file
    const sanitizedClientName = quotation.client.name.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Quotation_${quotation.quotationNumber}_${sanitizedClientName}.pdf`;
    const relativeLocalPath = `uploads/quotations/pdfs/${fileName}`;
    const absoluteLocalPath = path.resolve(process.cwd(), relativeLocalPath);

    console.log(`Verifying PDF at: ${absoluteLocalPath}`);
    const pdfBuffer = fs.readFileSync(absoluteLocalPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    console.log(`Total Pages: ${pages.length}`);

    let linkFound = false;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      console.log(`\n--- Page ${i + 1} Annotations ---`);

      const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
      if (!annots) {
        console.log('No annotations array found on this page.');
        continue;
      }

      console.log(`Found ${annots.size()} annotation(s)`);

      for (let j = 0; j < annots.size(); j++) {
        const annotRef = annots.get(j);
        const annot = pdfDoc.context.lookup(annotRef) as any;

        if (!annot) continue;

        const type = annot.get(PDFName.of('Type'))?.toString();
        const subtype = annot.get(PDFName.of('Subtype'))?.toString();
        const rect = annot.get(PDFName.of('Rect'))?.toString();

        console.log(`Annotation ${j + 1}: Type=${type}, Subtype=${subtype}, Rect=${rect}`);

        if (subtype === '/Link') {
          const actionRef = annot.get(PDFName.of('A'));
          if (actionRef) {
            const action = pdfDoc.context.lookup(actionRef) as any;
            const s = action.get(PDFName.of('S'))?.toString();
            const uri = action.get(PDFName.of('URI'))?.toString();
            console.log(`  Link Action S=${s}, URI=${uri}`);
            if (s === '/URI' && uri) {
              linkFound = true;
            }
          }
        }
      }
    }

    if (linkFound) {
      console.log('\n✅ SUCCESS: Hyperlink annotation successfully verified in the PDF page structure!');
    } else {
      console.error('\n❌ FAILURE: Hyperlink annotation was NOT found in the PDF page structure.');
    }

  } finally {
    // Restore the database setting
    console.log(`Restoring initial pdfOwnerPassword: "${initialOwnerPassword}"`);
    await prisma.globalSetting.upsert({
      where: { key: 'pdfOwnerPassword' },
      update: { value: initialOwnerPassword || '' },
      create: { key: 'pdfOwnerPassword', value: initialOwnerPassword || '' }
    });
  }
}

simulateRequest()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
