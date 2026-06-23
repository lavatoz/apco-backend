import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { AppError } from '../../middleware/error';
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  AssignAgreementSchema,
  UploadDocumentSchema,
  SignAgreementSchema,
} from './standalone-agreements.validation';
import {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  assignAgreement,
  uploadDocument,
  getDocuments,
  deleteDocument,
  downloadDocument,
  signAgreement,
  getSignature,
  downloadSignatureImage,
  generatePdf,
  downloadPdf,
} from './standalone-agreements.controller';


// Configure Multer for Standalone Agreements local storage
const uploadDir = path.join(process.cwd(), 'uploads/standalone-agreements');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only jpg, jpeg, png, and pdf formats are allowed.', 400), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter,
});

// 1. Router for Standalone Agreement Templates
const templatesRouter = Router();
templatesRouter.use(authenticate);

templatesRouter.post('/', validateBody(CreateTemplateSchema), createTemplate);
templatesRouter.get('/', getTemplates);
templatesRouter.get('/:id', getTemplateById);
templatesRouter.put('/:id', validateBody(UpdateTemplateSchema), updateTemplate);
templatesRouter.delete('/:id', deleteTemplate);

// 2. Router for Standalone Agreements
const agreementsRouter = Router();
agreementsRouter.use(authenticate);

agreementsRouter.post('/assign', validateBody(AssignAgreementSchema), assignAgreement);
agreementsRouter.post('/:agreementId/documents', upload.single('file'), validateBody(UploadDocumentSchema), uploadDocument);
agreementsRouter.get('/:agreementId/documents', getDocuments);
agreementsRouter.delete('/documents/:documentId', deleteDocument);
agreementsRouter.get('/documents/:documentId/download', downloadDocument);
agreementsRouter.post('/:agreementId/sign', validateBody(SignAgreementSchema), signAgreement);
agreementsRouter.get('/:agreementId/signature', getSignature);
agreementsRouter.get('/:agreementId/signature/image', downloadSignatureImage);
agreementsRouter.post('/:agreementId/generate-pdf', generatePdf);
agreementsRouter.get('/:agreementId/pdf', downloadPdf);


export {
  templatesRouter as standaloneAgreementTemplatesRouter,
  agreementsRouter as standaloneAgreementsRouter,
};
