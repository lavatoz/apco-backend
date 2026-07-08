const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Company Profiles and defaults ===');
  const companies = await prisma.companyProfile.findMany();
  companies.forEach(c => {
    console.log(`ID: ${c.id}`);
    console.log(`Name: ${c.companyName}`);
    console.log(`isDefault: ${c.isDefault}`);
    console.log(`Logo: ${c.logo ? c.logo.substring(0, 50) + '...' : 'null'}`);
    console.log('---');
  });

  console.log('=== Quotations ===');
  const quotations = await prisma.quotation.findMany({
    take: 5
  });
  quotations.forEach(q => {
    console.log(`ID: ${q.id}`);
    console.log(`Number: ${q.quotationNumber}`);
    console.log(`Brand: ${q.brand}`);
    console.log(`BrandID: ${q.brandId}`);
    console.log(`CompanyLogoURL: ${q.companyLogoUrl ? q.companyLogoUrl.substring(0, 50) + '...' : 'null'}`);
    console.log('---');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
