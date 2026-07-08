const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Company Profiles ===');
  const companies = await prisma.companyProfile.findMany();
  companies.forEach(c => {
    console.log(`ID: ${c.id}`);
    console.log(`Name: ${c.companyName}`);
    console.log(`Logo starts with: ${c.logo ? c.logo.substring(0, 80) + '...' : 'null'}`);
    console.log(`Logo Length: ${c.logo ? c.logo.length : 0}`);
    console.log('---');
  });

  console.log('=== Projects ===');
  const projects = await prisma.project.findMany({
    take: 5,
    include: { client: true }
  });
  projects.forEach(p => {
    console.log(`Project ID: ${p.id}, Name: ${p.name}, Client ID: ${p.clientId}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
