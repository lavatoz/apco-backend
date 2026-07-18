import { Request, Response } from 'express';
import { prisma } from '../src/config/database';

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

  const req = {
    params: { id: quotation.id },
    body: {},
    user: { id: user.id, role: 'SystemAdmin' }, // Force SystemAdmin to satisfy RBAC check
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

  // Run the controller
  await generateQuotationPdfController(req, res, next);
}

simulateRequest()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
