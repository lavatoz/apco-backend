import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const clientEmail = 'bro@gmail.com';
  const client = await prisma.client.findFirst({
    where: { email: clientEmail }
  });
  if (!client) {
    console.error("Client not found!");
    return;
  }
  const agreements = await prisma.standaloneAgreement.findMany({
    where: { clientId: client.id },
    include: {
      signatures: true,
      documents: true
    }
  });
  console.log("AGREEMENTS:", JSON.stringify(agreements, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
