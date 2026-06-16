import app from './app';
import { env } from './config/env';
import { checkDatabaseConnection } from './config/database';

async function startServer() {
  console.log('🚀 Initializing APCO Backend Foundation...');

  // 1. Verify Database Connectivity
  const dbConnected = await checkDatabaseConnection();
  if (dbConnected) {
    console.log('✨ Database connection verified successfully.');
  } else {
    console.warn('⚠️ Database connection verification failed. App will start, but db operations will fail.');
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
