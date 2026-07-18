import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const id = '4a77aab7-268f-4c39-b52d-5bef4059295a'; // admin user
  try {
    const data: any = {
      email: 'admin@apco.local',
      firstName: 'System',
      lastName: 'Admin',
      confirmPassword: 'ApcoAdminPassword123!'
    };
    
    console.log('Updating user with data:', data);
    const updated = await prisma.user.update({
      where: { id },
      data: data
    });
    console.log('Update success:', updated);
  } catch (error: any) {
    console.error('Error occurred:');
    console.error('Code:', error.code);
    console.error('Meta:', error.meta);
    console.error('Message:', error.message);
    console.error('Full Error Object:', error);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
