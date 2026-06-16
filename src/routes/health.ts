import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../config/database';
import { authenticateDrive } from '../services/google-drive.service';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const isDbConnected = await checkDatabaseConnection();
  
  let storageStatus: 'google-drive-connected' | 'google-drive-disconnected' = 'google-drive-disconnected';

  try {
    await authenticateDrive();
    storageStatus = 'google-drive-connected';
  } catch (err) {
    console.error('❌ Health check Google Drive authentication failed:', err);
    storageStatus = 'google-drive-disconnected';
  }

  const overallStatus = isDbConnected && (storageStatus === 'google-drive-connected') ? 'ok' : 'error';
  
  res.status(overallStatus === 'ok' ? 200 : 500).json({
    status: overallStatus,
    database: isDbConnected ? 'connected' : 'disconnected',
    storage: storageStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
