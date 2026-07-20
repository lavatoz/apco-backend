import { generateQuotationPdfController } from '../src/modules/invoices/invoices.controller';
import { verifyDocumentByIdController } from '../src/modules/public/public.controller';
import { prisma } from '../src/config/database';
import { DisplayIdGenerator } from '../src/services/display-id.service';

async function testBrandNewQuotationFlow() {
  console.log('🚀 Step 1: Creating a brand-new Quotation record in DB...');

  const client = await prisma.client.findFirst();
  const project = await prisma.project.findFirst();
  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['SystemAdmin', 'Manager'] } }
  });

  if (!client || !project || !adminUser) {
    throw new Error('Test prerequisite failed: Client, Project, or Admin user missing.');
  }

  const quotationCode = await DisplayIdGenerator.getNextId('QUO');
  const quotationNumber = `AUTO-QUO-2026-${Date.now().toString().slice(-4)}`;

  const newQuotation = await prisma.quotation.create({
    data: {
      quotationCode,
      quotationNumber,
      amount: 125000,
      status: 'DRAFT',
      clientId: client.id,
      projectId: project.id,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }
  });

  console.log(`Created new quotation ID: ${newQuotation.id}, Number: ${newQuotation.quotationNumber}`);

  // Step 2: Generate PDF via controller (without manual hash intervention)
  console.log('\n📄 Step 2: Triggering generateQuotationPdfController...');

  const req: any = {
    params: { id: newQuotation.id },
    user: adminUser,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' }
  };

  let pdfResult: any = null;
  let pdfStatus = 0;

  const res: any = {
    setHeader: () => res,
    status: (code: number) => {
      pdfStatus = code;
      return res;
    },
    send: (data: any) => {
      pdfResult = data;
      return res;
    },
    json: (data: any) => {
      pdfResult = data;
      return res;
    }
  };

  const next = (err?: any) => {
    if (err) throw err;
  };

  await generateQuotationPdfController(req, res, next);
  console.log(`PDF Generation HTTP Status: ${pdfStatus}`);

  // Step 3: Query DocumentRegistry immediately
  console.log('\n🔍 Step 3: Querying DocumentRegistry for auto-registered Document ID...');
  const docRegistry = await prisma.documentRegistry.findFirst({
    where: {
      documentNumber: newQuotation.quotationNumber,
      documentType: 'QUOTATION'
    }
  });

  if (!docRegistry) {
    throw new Error(`❌ DocumentRegistry record NOT found for ${newQuotation.quotationNumber}`);
  }

  console.log(`Registered Document ID: ${docRegistry.documentId}`);
  console.log(`Registered SHA-256 Hash: ${docRegistry.sha256Hash}`);

  // Step 4: Call public GET /api/verify/:documentId endpoint
  console.log(`\n🧪 Step 4: Calling GET /api/verify/${docRegistry.documentId}...`);

  const verifyReq: any = {
    params: { documentId: docRegistry.documentId },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' }
  };

  let verifyStatus = 0;
  let verifyData: any = null;

  const verifyRes: any = {
    status: (code: number) => {
      verifyStatus = code;
      return verifyRes;
    },
    json: (data: any) => {
      verifyData = data;
      return verifyRes;
    }
  };

  await verifyDocumentByIdController(verifyReq, verifyRes, next);

  console.log(`Verification Endpoint Status Code: ${verifyStatus}`);
  console.log('Verification Response Data:', JSON.stringify(verifyData, null, 2));

  if (verifyStatus === 200 && verifyData.verified === true && verifyData.verificationStatus === 'VERIFIED') {
    console.log('\n🎉 BRAND-NEW QUOTATION AUTO-VERIFICATION SUCCESSFUL (verified: true)!');
  } else {
    console.error('❌ Verification failed for brand-new quotation!');
    process.exit(1);
  }
}

testBrandNewQuotationFlow().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
