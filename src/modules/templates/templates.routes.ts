import { Router } from 'express';
import { 
  getAgreementTemplates,
  getAgreementTemplateById,
  createAgreementTemplate,
  updateAgreementTemplate,
  deleteAgreementTemplate,
  getCustomTemplates,
  createCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate
} from './templates.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect all template routes
router.use(authenticate);

// Agreement templates
router.get('/agreements', getAgreementTemplates);
router.get('/agreements/:id', getAgreementTemplateById);
router.post('/agreements', createAgreementTemplate);
router.put('/agreements/:id', updateAgreementTemplate);
router.delete('/agreements/:id', deleteAgreementTemplate);

// Custom overlay/layout templates
router.get('/custom', getCustomTemplates);
router.post('/custom', createCustomTemplate);
router.put('/custom/:id', updateCustomTemplate);
router.delete('/custom/:id', deleteCustomTemplate);

export default router;
