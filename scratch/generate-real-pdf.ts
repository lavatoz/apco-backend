import fs from 'fs';
import path from 'path';
import { generateQuotationPdf } from '../src/services/quotation-pdf.service';

async function main() {
  const data = {
    quotationNumber: 'QUO-2026-0001',
    companyName: 'Artisans Production Company',
    issueDate: '2026-06-25',
    validUntil: '2026-07-25',
    clientName: 'Joel Client',
    clientEmail: 'joel@client.com',
    clientPhone: '123456',
    clientAddress: '123 St',
    clientCompanyName: 'Client Corp',
    amount: 155000,
    items: [
      { description: 'Wedding Photography Main Coverage', quantity: 1, unitPrice: 50000, amount: 50000 },
      { description: 'Cinematic Video & Highlights Teaser (4K)', quantity: 1, unitPrice: 75000, amount: 75000 },
      { description: 'Physical Photo Album (Premium Leather, 50 Pages)', quantity: 2, unitPrice: 15000, amount: 30000 }
    ],
    discountValue: 10,
    discountType: 'Percentage',
    taxPercent: 18,
    shippingCost: 2000,
    advancePaid: 30000,
    balanceAmount: 118000,
    bankDetails: {
      bankName: 'Federal Bank',
      accountName: 'Artisans Production Company',
      accountNumber: '1234567890',
      ifscCode: 'FDRL0001234'
    },
    upiId: 'artisans@upi',
    templateId: 'apco_master_v1',
    themePreset: 'modern',
    primaryColor: '#3B82F6',
    brandName: 'APCO'
  };

  const buffer = await generateQuotationPdf(data);
  const outputPath = path.join(__dirname, 'quotation.pdf');
  fs.writeFileSync(outputPath, buffer);
  console.log('PDF generated at:', outputPath);
}

main().catch(console.error);
