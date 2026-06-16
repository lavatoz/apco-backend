import { Router } from 'express';
import { 
  getInvoices, 
  getInvoiceById,
  createInvoice, 
  updateInvoice, 
  deleteInvoice,
  getQuotations, 
  getQuotationById,
  createQuotation, 
  updateQuotation,
  deleteQuotation,
  getAgreements, 
  createAgreement, 
  recordPayment 
} from './invoices.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { 
  CreateInvoiceSchema, 
  UpdateInvoiceSchema, 
  CreateQuotationSchema, 
  UpdateQuotationSchema,
  CreateAgreementSchema, 
  RecordPaymentSchema 
} from './invoices.validation';

const router = Router();

// Protect all routes
router.use(authenticate);

// Invoices
router.get('/', getInvoices);
router.post('/', validateBody(CreateInvoiceSchema), createInvoice);
router.get('/:id', getInvoiceById);
router.put('/:id', validateBody(UpdateInvoiceSchema), updateInvoice);
router.delete('/:id', deleteInvoice);
router.post('/:id/payments', validateBody(RecordPaymentSchema), recordPayment);

// Quotations
router.get('/quotations', getQuotations);
router.post('/quotations', validateBody(CreateQuotationSchema), createQuotation);
router.get('/quotations/:id', getQuotationById);
router.put('/quotations/:id', validateBody(UpdateQuotationSchema), updateQuotation);
router.delete('/quotations/:id', deleteQuotation);

// Agreements
router.get('/agreements', getAgreements);
router.post('/agreements', validateBody(CreateAgreementSchema), createAgreement);

export default router;
