import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import fileRoutes from '../modules/files/files.routes';
import usersRoutes from '../modules/users/users.routes';
import clientsRoutes from '../modules/clients/clients.routes';
import projectsRoutes from '../modules/projects/projects.routes';
import invoicesRoutes from '../modules/invoices/invoices.routes';
import expensesRoutes from '../modules/expenses/expenses.routes';
import { 
  getQuotations, 
  createQuotation, 
  getQuotationById, 
  updateQuotation, 
  deleteQuotation 
} from '../modules/invoices/invoices.controller';
import { CreateQuotationSchema, UpdateQuotationSchema } from '../modules/invoices/invoices.validation';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import settingsRoutes from '../modules/settings/settings.routes';
import workflowRoutes from '../modules/workflow/workflow.routes';
import notificationsRoutes from '../modules/notifications/notifications.routes';
import tasksRoutes from '../modules/tasks/tasks.routes';
import approvalsRoutes from '../modules/approvals/approvals.routes';
import personnelRoutes from '../modules/personnel/personnel.routes';
import templatesRoutes from '../modules/templates/templates.routes';
import healthRoutes from './health';

const router = Router();

const financeRouter = Router();
financeRouter.use('/expenses', expensesRoutes);

const quotationRouter = Router();
quotationRouter.use(authenticate);
quotationRouter.get('/', getQuotations);
quotationRouter.post('/', validateBody(CreateQuotationSchema), createQuotation);
quotationRouter.get('/:id', getQuotationById);
quotationRouter.put('/:id', validateBody(UpdateQuotationSchema), updateQuotation);
quotationRouter.delete('/:id', deleteQuotation);

// Register base routes
router.use('/auth', authRoutes);
router.use('/files', fileRoutes);
router.use('/users', usersRoutes);
router.use('/clients', clientsRoutes);
router.use('/projects', projectsRoutes);
router.use('/invoices', invoicesRoutes);
router.use('/quotations', quotationRouter);
router.use('/finance', financeRouter);
router.use('/settings', settingsRoutes);
router.use('/workflow', workflowRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/tasks', tasksRoutes);
router.use('/approvals', approvalsRoutes);
router.use('/personnel', personnelRoutes);
router.use('/templates', templatesRoutes);
router.use('/', healthRoutes);

export default router;
