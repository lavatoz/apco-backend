import app from './app';
import { env } from './config/env';
import { checkDatabaseConnection, prisma } from './config/database';

async function repairMissingProjects() {
  try {
    console.log('🔧 Running project association health check...');
    const clientsWithoutProjects = await prisma.client.findMany({
      where: {
        deletedAt: null,
        projects: {
          none: {
            deletedAt: null
          }
        }
      }
    });

    if (clientsWithoutProjects.length > 0) {
      console.log(`🔧 Found ${clientsWithoutProjects.length} client(s) with missing project records. Provisioning default projects...`);
      for (const client of clientsWithoutProjects) {
        await prisma.project.create({
          data: {
            name: `${client.name}'s Project`,
            status: 'Draft',
            clientId: client.id,
            stage: 'Booked'
          }
        });
        console.log(`✅ Provisioned default project for client: ${client.name} (ID: ${client.id})`);
      }
      console.log('✨ Project association repair complete.');
    } else {
      console.log('✅ All clients have corresponding project records. Database is healthy.');
    }
  } catch (error) {
    console.error('❌ Failed to run project association health check:', error);
  }
}

async function startServer() {
  console.log('🚀 Initializing APCO Backend Foundation...');

  // 1. Verify Database Connectivity
  const dbConnected = await checkDatabaseConnection();
  if (dbConnected) {
    console.log('✨ Database connection verified successfully.');
    await repairMissingProjects();
  } else {
    console.warn('⚠️ Database connection verification failed. App will start, but db operations will fail.');
  }

  // 2. Initialize Google Drive Service
  try {
    const { initializeGoogleDrive } = await import('./services/google-drive.service');
    await initializeGoogleDrive();
  } catch (error) {
    console.error('❌ Failed to run Google Drive startup initialization:', error);
  }

  // 2. Start Express Server listener
  const server = app.listen(env.PORT, () => {
    console.log(`📡 APCO server listening on port ${env.PORT} in [${env.NODE_ENV}] mode`);
    console.log(`🔗 App URL: ${env.APP_URL}`);
  });

  // 3. Graceful Shutdown handlers
  const shutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down server gracefully...`);
    server.close(async () => {
      console.log('💤 Express server closed.');
      // Disconnect database client
      const { prisma } = await import('./config/database');
      await prisma.$disconnect();
      console.log('🔌 Database disconnected.');
      process.exit(0);
    });

    // Force close server after 10 seconds
    setTimeout(() => {
      console.error('💥 Could not close connections in time, forcefully shutting down.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Global Exception handlers
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});

// Boot server
startServer().catch((error) => {
  console.error('❌ Server startup failure:', error);
  process.exit(1);
});
