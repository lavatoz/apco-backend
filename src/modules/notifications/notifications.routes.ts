import { Router } from 'express';
import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  getUnreadCount
} from './notifications.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect all notification routes
router.use(authenticate);

router.get('/unread-count', getUnreadCount);
router.get('/', getNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', deleteAllNotifications);

export default router;
