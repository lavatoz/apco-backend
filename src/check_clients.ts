import { prisma } from './config/database';

async function main() {
  const clients = await prisma.client.findMany();
  console.log("CLIENTS IN DATABASE:");
  console.dir(clients, { depth: null });
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
