import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      user: {
        select: {
          email: true,
          status: true
        }
      }
    }
  });
  console.log("CLIENTS_LIST:", JSON.stringify(clients, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
