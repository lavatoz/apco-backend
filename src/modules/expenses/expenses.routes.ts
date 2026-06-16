import { Router } from 'express';
import { 
  getExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense 
} from './expenses.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateExpenseSchema, UpdateExpenseSchema } from './expenses.validation';

const router = Router();

// Protect all routes
router.use(authenticate);

router.get('/', getExpenses);
router.post('/', validateBody(CreateExpenseSchema), createExpense);
router.put('/:id', validateBody(UpdateExpenseSchema), updateExpense);
router.delete('/:id', deleteExpense);

export default router;
