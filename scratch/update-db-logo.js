const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const newLogoPath = 'C:/Users/joeln/.gemini/antigravity-ide/brain/cfca8c59-b337-42a4-9976-ff2b0606d92f/media__1783361779690.png';
  const logoBuffer = fs.readFileSync(newLogoPath);
  const newLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  console.log('Updating Tiny Toes logo in database...');
  
  const result = await prisma.companyProfile.updateMany({
    where: { companyName: 'Tiny Toes' },
    data: { logo: newLogoBase64 }
  });

  console.log(`Updated ${result.count} company profile(s) for Tiny Toes.`);

  // Clean up any registered quotation files on disk/DB for APCO-QUO-2026-0001
  // to force the server/client to regenerate and serve the new PDF instead of cached files
  const deletedFiles = await prisma.file.deleteMany({
    where: { originalName: { contains: 'APCO-QUO-2026-0001' } }
  });
  console.log(`Deleted ${deletedFiles.count} file record(s) matching APCO-QUO-2026-0001 to clear cache.`);

  // Also physically delete the local pdf if it exists to force regeneration
  const localPdfPath = 'uploads/quotations/pdfs/Quotation_APCO-QUO-2026-0001_priya.pdf';
  if (fs.existsSync(localPdfPath)) {
    fs.unlinkSync(localPdfPath);
    console.log(`Physically deleted local PDF: ${localPdfPath}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
