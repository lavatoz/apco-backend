import { generateQuotationPdfController } from '../src/modules/invoices/invoices.controller';
import { verifyDocumentByIdController } from '../src/modules/public/public.controller';
import { prisma } from '../src/config/database';

async function testFullQuotationFlow() {
  console.log('🚀 Step 1: Finding an existing Quotation & Admin User for test...');

  const quotation = await prisma.quotation.findFirst({
    include: { client: true, project: true }
  });

  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['SystemAdmin', 'Manager'] } }
  });

  if (!quotation || !adminUser) {
    throw new Error('Test prerequisite failed: Quotation or Admin User not found in DB.');
  }

  console.log(`Using Quotation ID: ${quotation.id}, Quotation Number: ${quotation.quotationNumber}`);

  // Mock Request & Response for generateQuotationPdfController
  const req: any = {
    params: { id: quotation.id },
    user: adminUser,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' }
  };

  let pdfBufferResult: any = null;
  let statusCode = 0;

  const res: any = {
    setHeader: () => res,
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    send: (data: any) => {
      pdfBufferResult = data;
      return res;
    },
    json: (data: any) => {
      pdfBufferResult = data;
      return res;
    }
  };

  const next = (err?: any) => {
    if (err) {
      console.error('Controller Error:', err);
      throw err;
    }
  };

  console.log('\n📄 Step 2: Executing generateQuotationPdfController...');
  await generateQuotationPdfController(req, res, next);
  console.log(`Controller execution finished. Status Code: ${statusCode}`);

  // Step 3: Immediately query DocumentRegistry for this quotation number
  console.log('\n🔍 Step 3: Querying DocumentRegistry for document number:', quotation.quotationNumber);
  const docRecord = await prisma.documentRegistry.findFirst({
    where: {
      documentNumber: quotation.quotationNumber,
      documentType: 'QUOTATION'
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log('DocumentRegistry Record Found:');
  console.log(JSON.stringify(docRecord, null, 2));

  if (!docRecord) {
    throw new Error('❌ DocumentRegistry entry NOT FOUND for new quotation generation!');
  }

  console.log(`\n✅ Document ID generated & registered: ${docRecord.documentId}`);

  // Step 4: Call verifyDocumentByIdController for this documentId
  console.log('\n🧪 Step 4: Testing GET /api/verify/' + docRecord.documentId);
  const verifyReq: any = {
    params: { documentId: docRecord.documentId },
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

  console.log(`Verification Status Code: ${verifyStatus}`);
  console.log('Verification Response Payload:');
  console.log(JSON.stringify(verifyData, null, 2));

  if (verifyStatus === 200 && verifyData.verified === true && verifyData.verificationStatus === 'VERIFIED') {
    console.log('\n🎉 ALL VERIFICATION FLOW TESTS PASSED 100% SUCCESSFUL!');
  } else {
    console.error('❌ Verification endpoint failed to confirm document authenticity.');
    process.exit(1);
  }
}

testFullQuotationFlow().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
