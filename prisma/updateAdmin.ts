import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Seeding and updating Division instagramUrl values in DB...');

  // Check if AAHA Kalyanam exists
  const existingAaha = await prisma.division.findFirst({ where: { name: 'AAHA Kalyanam' } });
  if (!existingAaha) {
    await prisma.division.create({
      data: {
        name: 'AAHA Kalyanam',
        description: 'Premium cinematic wedding photography and film production house.',
        instagramUrl: 'https://instagram.com/aahakalyanam',
        published: true,
        media: {
          create: [
            { type: 'IMAGE', position: 1, url: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?q=80&w=600&auto=format&fit=crop', fileId: 'img1' },
            { type: 'IMAGE', position: 2, url: 'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=600&auto=format&fit=crop', fileId: 'img2' },
            { type: 'IMAGE', position: 3, url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=600&auto=format&fit=crop', fileId: 'img3' }
          ]
        }
      }
    });
    console.log('Created AAHA Kalyanam division');
  } else {
    await prisma.division.update({
      where: { id: existingAaha.id },
      data: { instagramUrl: 'https://instagram.com/aahakalyanam', published: true }
    });
    console.log('Updated AAHA Kalyanam division');
  }

  // Check if Tiny Toes exists
  const existingTiny = await prisma.division.findFirst({ where: { name: 'Tiny Toes' } });
  if (!existingTiny) {
    await prisma.division.create({
      data: {
        name: 'Tiny Toes',
        description: 'Creative fine art newborn, baby, and maternity portraiture.',
        instagramUrl: 'https://instagram.com/tinytoes',
        published: true,
        media: {
          create: [
            { type: 'IMAGE', position: 1, url: 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?q=80&w=600&auto=format&fit=crop', fileId: 'img4' },
            { type: 'IMAGE', position: 2, url: 'https://images.unsplash.com/photo-1519689680058-324335c77ebe?q=80&w=600&auto=format&fit=crop', fileId: 'img5' },
            { type: 'IMAGE', position: 3, url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=600&auto=format&fit=crop', fileId: 'img6' }
          ]
        }
      }
    });
    console.log('Created Tiny Toes division');
  } else {
    await prisma.division.update({
      where: { id: existingTiny.id },
      data: { instagramUrl: 'https://instagram.com/tinytoes', published: true }
    });
    console.log('Updated Tiny Toes division');
  }

  // Verify DB state
  const divisionsList = await prisma.division.findMany({
    select: {
      id: true,
      name: true,
      instagramUrl: true,
      published: true
    }
  });
  console.log('\nCurrent Division states in DB:');
  console.dir(divisionsList, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
