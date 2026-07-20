import { PDFDocument, PDFName, PDFArray, PDFRef, PDFDict } from 'pdf-lib';
import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import { DocumentRegistryService } from '../src/services/document-registry.service';
import * as pdfSecurity from '../src/services/pdf-security.service';
import fs from 'fs';
import path from 'path';

async function inspectPdfFile() {
  console.log('🔍 Tasks 1-4: Inspecting existing generated PDF file on disk...');
  const diskPath = path.resolve(process.cwd(), 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0004_rohit.pdf');
  
  if (!fs.existsSync(diskPath)) {
    console.error(`File not found at: ${diskPath}`);
    return;
  }

  const rawDiskBuffer = fs.readFileSync(diskPath);
  console.log(`Loaded PDF from disk: ${diskPath} (${rawDiskBuffer.length} bytes)`);

  // Helper to dump annotations from a PDFDocument
  async function dumpAnnotations(doc: PDFDocument, label: string) {
    console.log(`\n========================================`);
    console.log(`--- DUMPING ANNOTATIONS: ${label} ---`);
    console.log(`========================================`);

    const pages = doc.getPages();
    console.log(`Total Pages: ${pages.length}`);

    let linkCount = 0;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);

      console.log(`Page ${pageIdx + 1}: Annots array present? ${!!annots} (Size: ${annots?.size() || 0})`);

      if (annots) {
        for (let i = 0; i < annots.size(); i++) {
          let annotRef = annots.get(i);
          let annotObj: any = doc.context.lookup(annotRef);

          while (annotObj && annotObj instanceof PDFRef) {
            annotObj = doc.context.lookup(annotObj);
          }

          if (annotObj && annotObj instanceof PDFDict) {
            const subtype = annotObj.get(PDFName.of('Subtype'))?.toString();
            const rect = annotObj.get(PDFName.of('Rect'))?.toString();
            const quadPoints = annotObj.get(PDFName.of('QuadPoints'))?.toString();
            const flags = annotObj.get(PDFName.of('F'))?.toString();
            const actionRef = annotObj.get(PDFName.of('A'));

            let uriAction = 'None';
            if (actionRef) {
              let actionObj: any = doc.context.lookup(actionRef);
              while (actionObj && actionObj instanceof PDFRef) {
                actionObj = doc.context.lookup(actionObj);
              }
              if (actionObj && actionObj instanceof PDFDict) {
                uriAction = actionObj.get(PDFName.of('URI'))?.toString() || 'Action Dict without URI';
              } else if (actionObj) {
                uriAction = actionObj.toString();
              }
            }

            console.log(`  Annotation #${i + 1}:`);
            console.log(`    - Subtype: ${subtype}`);
            console.log(`    - Rect: ${rect}`);
            console.log(`    - QuadPoints: ${quadPoints || 'None'}`);
            console.log(`    - Flags (F): ${flags || 'None'}`);
            console.log(`    - URI Action (A): ${uriAction}`);

            if (subtype === '/Link') {
              linkCount++;
            }
          } else {
            console.log(`  Annotation #${i + 1}: Unresolvable or non-dict object:`, annotObj?.toString());
          }
        }
      }
    }

    console.log(`Total Link Annotations Found in [${label}]: ${linkCount}`);
    return linkCount;
  }

  // 1. Inspect Raw Disk PDF
  console.log('\n--- 1. Inspecting PDF directly from disk ---');
  try {
    const diskDoc = await PDFDocument.load(rawDiskBuffer, { ignoreEncryption: true });
    await dumpAnnotations(diskDoc, 'Disk PDF File');
  } catch (err) {
    console.error('Failed to load disk doc with pdf-lib:', err);
  }

  // 2. Check PDF generation pipeline BEFORE and AFTER securePdfDocument
  console.log('\n--- 2. Inspecting PDF BEFORE encryption vs AFTER encryption ---');
  const quotDocId = 'AK-DOC-2026-000009';
  const verificationUrl = DocumentRegistryService.getVerificationUrl(quotDocId);

  // Bypass encryption first to inspect unencrypted PDF
  const originalSecure = pdfSecurity.securePdfDocument;
  let unencryptedBuffer: Buffer | null = null;
  (pdfSecurity as any).securePdfDocument = async (buffer: Buffer) => {
    unencryptedBuffer = buffer;
    return originalSecure(buffer);
  };

  const finalSecuredBuffer = await generateQuotationPdf({
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

  (pdfSecurity as any).securePdfDocument = originalSecure;

  if (unencryptedBuffer) {
    const unencryptedDoc = await PDFDocument.load(unencryptedBuffer);
    await dumpAnnotations(unencryptedDoc, 'BEFORE Encryption (Unencrypted PDF)');
  }

  const encryptedDoc = await PDFDocument.load(finalSecuredBuffer, { ignoreEncryption: true });
  await dumpAnnotations(encryptedDoc, 'AFTER Encryption (Final Secured PDF)');
}

inspectPdfFile().catch(console.error);
