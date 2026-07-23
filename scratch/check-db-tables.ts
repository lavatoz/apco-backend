import { prisma } from '../src/config/database';

async function checkTables() {
  const tables: any[] = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
  );
  console.log('PG TABLES:');
  console.log(tables.map((t: any) => t.tablename));

  const count: any[] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*)::int as count FROM "GalleryCollection";'
  );
  console.log('GALLERY COLLECTION COUNT:', count[0].count);

  process.exit(0);
}

checkTables().catch((err) => {
  console.error(err);
  process.exit(1);
});
