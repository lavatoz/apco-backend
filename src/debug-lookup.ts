import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log("=== CREATING TEST PROJECT ===");
  try {
    const testProject = await prisma.project.create({
      data: {
        name: "Test Wedding Project",
        description: "A beautiful wedding shoot",
        status: "Draft",
        clientId: "a9fa79d9-9df5-4651-979d-cd4d428a031b",
        stage: "Booked"
      }
    });
    console.log("TEST PROJECT CREATED:", JSON.stringify(testProject, null, 2));
  } catch (err: any) {
    console.error("Failed to create project:", err.message);
  }

  console.log("=== ALL PROJECTS IN PostgreSQL ===");
  const projects = await prisma.project.findMany({
    include: {
      client: true
    }
  });
  console.log("PROJECTS:", JSON.stringify(projects, null, 2));
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
