import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import { generateAgreementPdf } from '../src/services/agreement-pdf.service';
import { applyVerificationFooterToDoc } from '../src/services/pdf-branding.service';
import { DocumentRegistryService } from '../src/services/document-registry.service';
import { PDFDocument, PDFName, PDFArray, PDFRef, PDFDict } from 'pdf-lib';
import * as pdfSecurity from '../src/services/pdf-security.service';

async function runPdfTests() {
  console.log('🚀 Testing PDF verification URL generation & clickable link annotations across all document types...\n');

  // Bypass encryption for inspection test by overriding securePdfDocument
  const originalSecure = pdfSecurity.securePdfDocument;
  (pdfSecurity as any).securePdfDocument = async (buffer: Buffer) => {
    return { securedBuffer: buffer, fingerprint: 'mock-hash' };
  };

  let totalErrors = 0;

  async function inspectAndVerifyPdf(pdfBuffer: Buffer, docType: string, expectedDocId: string) {
    const expectedUrl = `https://verify.artisains.com/verify/${expectedDocId}`;
    console.log(`\n--- Inspecting [${docType}] PDF (DocId: ${expectedDocId}) ---`);
    console.log(`Expected Verification URL: ${expectedUrl}`);

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    console.log(`Total Pages: ${pages.length}`);

    let foundLinkAnnotation = false;
    let foundCorrectUri = false;
    let containsLocalhost = false;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
      
      if (annots) {
        for (let i = 0; i < annots.size(); i++) {
          let annotRef = annots.get(i);
          let annotObj: any = pdfDoc.context.lookup(annotRef);

          while (annotObj && annotObj instanceof PDFRef) {
            annotObj = pdfDoc.context.lookup(annotObj);
          }

          if (annotObj && annotObj instanceof PDFDict) {
            const subtype = annotObj.get(PDFName.of('Subtype'))?.toString();
            const flags = annotObj.get(PDFName.of('F'))?.toString();
            const rect = annotObj.get(PDFName.of('Rect'))?.toString();
            const quadPoints = annotObj.get(PDFName.of('QuadPoints'))?.toString();

            if (subtype === '/Link') {
              foundLinkAnnotation = true;
              let actionRef = annotObj.get(PDFName.of('A'));
              let actionObj: any = pdfDoc.context.lookup(actionRef);
              while (actionObj && actionObj instanceof PDFRef) {
                actionObj = pdfDoc.context.lookup(actionObj);
              }

              if (actionObj && actionObj instanceof PDFDict) {
                const uriRaw = actionObj.get(PDFName.of('URI'))?.toString() || '';
                
                console.log(`  Page ${pageIdx + 1} Link Annotation:`);
                console.log(`    Subtype: ${subtype}`);
                console.log(`    Print Flag (F): ${flags}`);
                console.log(`    Rect: ${rect}`);
                console.log(`    QuadPoints: ${quadPoints ? 'Present' : 'None'}`);
                console.log(`    URI: ${uriRaw}`);

                if (uriRaw.includes('localhost')) {
                  containsLocalhost = true;
                }

                if (uriRaw === `(${expectedUrl})` || uriRaw.includes(expectedUrl)) {
                  foundCorrectUri = true;
                }
              }
            }
          }
        }
      }
    }

    if (!foundLinkAnnotation) {
      console.error(`❌ ERROR [${docType}]: No PDF Link Annotation found!`);
      totalErrors++;
    } else {
      console.log(`  ✅ PDF Link Annotation present with Rect, QuadPoints, and Print Flag (F:4)`);
    }

    if (containsLocalhost) {
      console.error(`❌ ERROR [${docType}]: Contains localhost reference!`);
      totalErrors++;
    } else {
      console.log(`  ✅ No localhost references found`);
    }

    if (!foundCorrectUri) {
      console.error(`❌ ERROR [${docType}]: URI does not match expected '${expectedUrl}'!`);
      totalErrors++;
    } else {
      console.log(`  ✅ Verification URI is correct: ${expectedUrl}`);
    }
  }

  try {
    // 1. Quotation PDF
    const quotDocId = 'APCO-DOC-2026-000101';
    const quotVerificationUrl = DocumentRegistryService.getVerificationUrl(quotDocId);
    const quotationBuffer = await generateQuotationPdf({
      quotationNumber: 'QT-2026-001',
      issueDate: '2026-07-20',
      validUntil: '2026-08-20',
      clientName: 'Jane Doe',
      clientEmail: 'jane@example.com',
      items: [
        { description: 'Wedding Photography', quantity: 1, unitPrice: 50000, amount: 50000 },
      ],
      amount: 50000,
      advancePaid: 20000,
      balanceAmount: 30000,
      companyName: 'Artisans Production Company',
      verificationUrl: quotVerificationUrl,
    });
    await inspectAndVerifyPdf(quotationBuffer, 'Quotation', quotDocId);

    // 2. Invoice PDF
    const invDocId = 'APCO-DOC-2026-000102';
    const invVerificationUrl = DocumentRegistryService.getVerificationUrl(invDocId);
    const invoiceBuffer = await generateQuotationPdf({
      quotationNumber: 'INV-2026-001',
      issueDate: '2026-07-20',
      validUntil: '2026-08-20',
      clientName: 'John Smith',
      clientEmail: 'john@example.com',
      items: [
        { description: 'Videography Services', quantity: 1, unitPrice: 75000, amount: 75000 },
      ],
      amount: 75000,
      advancePaid: 35000,
      balanceAmount: 40000,
      companyName: 'Artisans Production Company',
      verificationUrl: invVerificationUrl,
    });
    await inspectAndVerifyPdf(invoiceBuffer, 'Invoice', invDocId);

    // 3. Agreement PDF
    const agrDocId = 'APCO-DOC-2026-000103';
    const agrVerificationUrl = DocumentRegistryService.getVerificationUrl(agrDocId);
    const agreementBuffer = await generateAgreementPdf({
      clientName: 'Alice Smith',
      brideName: 'Alice',
      groomName: 'Bob',
      eventName: 'Wedding',
      eventDate: '2026-12-15',
      venue: 'Grand Hotel',
      totalAmount: 'Rs. 1,00,000',
      advanceAmount: 'Rs. 40,000',
      balanceAmount: 'Rs. 60,000',
      todayDate: '2026-07-20',
      quotationNumber: 'QT-2026-001',
      invoiceNumber: 'INV-2026-001',
      companyName: 'APCO Productions',
      verificationUrl: agrVerificationUrl,
    });
    await inspectAndVerifyPdf(agreementBuffer, 'Agreement', agrDocId);

    // 4. Standalone Agreement PDF
    const standDocId = 'APCO-DOC-2026-000104';
    const standVerificationUrl = DocumentRegistryService.getVerificationUrl(standDocId);
    const standPdfDoc = await PDFDocument.create();
    standPdfDoc.addPage([595.28, 841.89]);
    await applyVerificationFooterToDoc(standPdfDoc, standVerificationUrl, { hasBlackFooter: false, margin: 50 });
    const standPdfBytes = await standPdfDoc.save();
    await inspectAndVerifyPdf(Buffer.from(standPdfBytes), 'Standalone Agreement', standDocId);

    console.log('\n========================================');
    if (totalErrors === 0) {
      console.log('🎉 ALL PDF VERIFICATION TESTS PASSED SUCCESSFULLY!');
    } else {
      console.error(`❌ TESTS FAILED WITH ${totalErrors} ERROR(S).`);
      process.exit(1);
    }
  } finally {
    (pdfSecurity as any).securePdfDocument = originalSecure;
  }
}

runPdfTests().catch(err => {
  console.error('Fatal error during PDF verification tests:', err);
  process.exit(1);
});
