import { z } from 'zod';

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  version: z.string().min(1, 'Version is required'),
  content: z.string().min(1, 'Content is required'),
});

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const AssignAgreementSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  templateId: z.string().min(1, 'Template ID is required'),
});

import { DocumentType } from '@prisma/client';

export const UploadDocumentSchema = z.object({
  documentType: z.nativeEnum(DocumentType),
});

export const SignAgreementSchema = z.object({
  signerName: z.string().min(1, 'Signer name is required'),
  signatureImageUrl: z.string().min(1, 'Signature image is required'),
});


