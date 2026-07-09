import { PrismaClient } from '@prisma/client';
import { DisplayIdGenerator } from '../src/services/display-id.service';

const prisma = new PrismaClient();

async function main() {
  console.log('🏁 Starting backfill for display IDs...');

  // 1. Clients
  const clients = await prisma.client.findMany({
    where: { clientCode: null },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${clients.length} clients to backfill.`);
  for (const item of clients) {
    const code = await DisplayIdGenerator.getNextId('CLI');
    await prisma.client.update({
      where: { id: item.id },
      data: { clientCode: code },
    });
    console.log(`Backfilled Client ${item.id} with ${code}`);
  }

  // 2. Projects
  const projects = await prisma.project.findMany({
    where: { projectCode: null },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${projects.length} projects to backfill.`);
  for (const item of projects) {
    const code = await DisplayIdGenerator.getNextId('PRJ');
    await prisma.project.update({
      where: { id: item.id },
      data: { projectCode: code },
    });
    console.log(`Backfilled Project ${item.id} with ${code}`);
  }

  // 3. Quotations
  const quotations = await prisma.quotation.findMany({
    where: { quotationCode: null },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${quotations.length} quotations to backfill.`);
  for (const item of quotations) {
    const code = await DisplayIdGenerator.getNextId('QUO');
    await prisma.quotation.update({
      where: { id: item.id },
      data: { quotationCode: code },
    });
    console.log(`Backfilled Quotation ${item.id} with ${code}`);
  }

  // 4. Invoices
  const invoices = await prisma.invoice.findMany({
    where: { invoiceCode: null },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${invoices.length} invoices to backfill.`);
  for (const item of invoices) {
    const code = await DisplayIdGenerator.getNextId('INV');
    await prisma.invoice.update({
      where: { id: item.id },
      data: { invoiceCode: code },
    });
    console.log(`Backfilled Invoice ${item.id} with ${code}`);
  }

  // 5. StandaloneAgreements
  const agreements = await prisma.standaloneAgreement.findMany({
    where: { agreementCode: null },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${agreements.length} agreements to backfill.`);
  for (const item of agreements) {
    const code = await DisplayIdGenerator.getNextId('AGR');
    await prisma.standaloneAgreement.update({
      where: { id: item.id },
      data: { agreementCode: code },
    });
    console.log(`Backfilled StandaloneAgreement ${item.id} with ${code}`);
  }

  // 6. Events
  const events = await prisma.event.findMany({
    where: { eventCode: null },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${events.length} events to backfill.`);
  for (const item of events) {
    const code = await DisplayIdGenerator.getNextId('EVT');
    await prisma.event.update({
      where: { id: item.id },
      data: { eventCode: code },
    });
    console.log(`Backfilled Event ${item.id} with ${code}`);
  }

  console.log('✅ Backfill complete!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
