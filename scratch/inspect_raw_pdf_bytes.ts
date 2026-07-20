import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const url = 'https://verify.artisains.com/verify/AK-DOC-2026-000009';

  page.drawText(url, { x: 50, y: 700, size: 10, font });

  const { context } = pdfDoc;
  const uriAction = context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of(url),
  });

  const linkAnnot = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, 695, 450, 715],
      Border: [0, 0, 0],
      F: 4,
      A: uriAction,
    })
  );

  page.node.set(PDFName.of('Annots'), context.obj([linkAnnot]));

  const bytes = await pdfDoc.save();
  const str = Buffer.from(bytes).toString('utf-8');
  console.log('--- RAW PDF DICTIONARY SYNTAX FOR LINK ANNOTATION ---');
  console.log(str);
}

main().catch(console.error);
