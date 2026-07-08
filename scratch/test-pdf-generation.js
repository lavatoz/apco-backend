const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateQuotationPdf } = require('../src/services/quotation-pdf.service');
const { aahaLogoBase64, tinyToesLogoBase64 } = require('../src/services/default-logo');
const fs = require('fs');
const path = require('path');

async function main() {
  const quotation = await prisma.quotation.findFirst({
    where: { quotationNumber: 'APCO-QUO-2026-0001' },
    include: {
      items: true,
      project: true,
      client: true,
    },
  });

  if (!quotation) {
    console.error('Quotation APCO-QUO-2026-0001 not found in database');
    return;
  }

  console.log('Found Quotation:', quotation.quotationNumber);

  let brandProfile = null;
  if (quotation.brandId) {
    brandProfile = await prisma.companyProfile.findFirst({
      where: { id: quotation.brandId, deletedAt: null },
    });
  }

  if (!brandProfile && quotation.brand) {
    brandProfile = await prisma.companyProfile.findFirst({
      where: { companyName: quotation.brand, deletedAt: null },
    });
  }

  const activeBrandName = brandProfile?.companyName || quotation.brand || undefined;
  console.log('Resolved activeBrandName:', activeBrandName);

  const companyProfile = await prisma.companyProfile.findFirst({
    where: { isDefault: true, deletedAt: null },
  });
  console.log('Resolved companyProfile exists:', !!companyProfile);

  let companyLogoUrl = undefined;
  if (brandProfile?.logo) {
    companyLogoUrl = brandProfile.logo;
    console.log('Resolved from brandProfile.logo');
  } else if (companyProfile?.logo) {
    companyLogoUrl = companyProfile.logo;
    console.log('Resolved from companyProfile.logo');
  } else if (activeBrandName) {
    const normalized = activeBrandName.toLowerCase();
    if (normalized.includes('aaha')) {
      companyLogoUrl = aahaLogoBase64;
      console.log('Resolved to fallback aahaLogoBase64');
    } else if (normalized.includes('tiny toes')) {
      companyLogoUrl = tinyToesLogoBase64;
      console.log('Resolved to fallback tinyToesLogoBase64');
    }
  }

  console.log('Final resolved companyLogoUrl starts with:', companyLogoUrl ? companyLogoUrl.substring(0, 80) + '...' : 'undefined');

  const pdfBuffer = await generateQuotationPdf({
    quotationNumber: quotation.quotationNumber,
    issueDate: quotation.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    validUntil: quotation.validUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    clientName: quotation.client.name,
    clientEmail: quotation.client.email,
    clientPhone: quotation.client.phone || undefined,
    clientAddress: quotation.client.address || undefined,
    clientCompanyName: quotation.client.companyName || undefined,
    items: quotation.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      amount: Number(item.amount),
    })),
    amount: Number(quotation.amount),
    discountType: quotation.discountType || undefined,
    discountValue: quotation.discountValue ? Number(quotation.discountValue) : undefined,
    taxPercent: quotation.taxPercent ? Number(quotation.taxPercent) : undefined,
    shippingCost: quotation.shippingCost ? Number(quotation.shippingCost) : undefined,
    advancePaid: 0,
    balanceAmount: Number(quotation.amount),
    companyName: companyProfile?.companyName || 'Artisans Production Company',
    companyLogoUrl,
    brandName: activeBrandName,
  });

  const outputPath = 'scratch/test-quote.pdf';
  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`Saved generated PDF to ${outputPath}, size: ${pdfBuffer.length} bytes`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
