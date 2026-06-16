import { Router } from 'express';
import { 
  getCompanies, 
  getCompanyById,
  saveCompany, 
  deleteCompany, 
  getGlobalSettings, 
  saveGlobalSettings 
} from './settings.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CompanyProfileSchema, BulkSettingsSchema } from './settings.validation';

const router = Router();

// All settings routes are protected by default
router.use(authenticate);

// Multi-brand companies endpoints
router.get('/companies', getCompanies);
router.get('/companies/:id', getCompanyById);
router.post('/companies', validateBody(CompanyProfileSchema), saveCompany);
router.put('/companies/:id', validateBody(CompanyProfileSchema), saveCompany);
router.delete('/companies/:id', deleteCompany);

// Global preferences endpoints
router.get('/global', getGlobalSettings);
router.post('/global', validateBody(BulkSettingsSchema), saveGlobalSettings);

export default router;
