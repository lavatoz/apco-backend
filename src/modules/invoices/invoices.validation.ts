import { z } from 'zod';

const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.union([z.number(), z.string()]).transform((val) => String(val)),
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)),
});

export const CreateInvoiceSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  clientId: z.string().uuid('Invalid client ID'),
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)),
  status: z.string().default('Draft'),
  dueDate: z.string().datetime('Due date must be a valid ISO datetime string'),
  discountValue: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  discountType: z.string().optional().nullable(),
  taxPercent: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  shippingCost: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  notes: z.string().optional().nullable(),
  termsSummary: z.string().optional().nullable(),
  companyLogoUrl: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  templateVersion: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  items: z.array(ItemSchema).optional(),
});

export const UpdateInvoiceSchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)).optional(),
  status: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  discountValue: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  discountType: z.string().optional().nullable(),
  taxPercent: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  shippingCost: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  notes: z.string().optional().nullable(),
  termsSummary: z.string().optional().nullable(),
  companyLogoUrl: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  templateVersion: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  items: z.array(ItemSchema).optional(),
});

export const CreateQuotationSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  clientId: z.string().uuid('Invalid client ID'),
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)),
  status: z.string().default('Draft'),
  validUntil: z.string().datetime('Valid until must be a valid ISO datetime string'),
  discountValue: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  discountType: z.string().optional().nullable(),
  taxPercent: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  shippingCost: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  notes: z.string().optional().nullable(),
  termsSummary: z.string().optional().nullable(),
  companyLogoUrl: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  templateVersion: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  items: z.array(ItemSchema).optional(),
});

export const UpdateQuotationSchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)).optional(),
  status: z.string().optional(),
  validUntil: z.string().datetime().optional(),
  discountValue: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  discountType: z.string().optional().nullable(),
  taxPercent: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  shippingCost: z.union([z.number(), z.string()]).transform((val) => String(val)).optional().nullable(),
  notes: z.string().optional().nullable(),
  termsSummary: z.string().optional().nullable(),
  companyLogoUrl: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  templateVersion: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  items: z.array(ItemSchema).optional(),
});

export const RecordPaymentSchema = z.object({
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)),
  status: z.string(),
  paymentMethod: z.string(),
  transactionId: z.string().optional().nullable(),
});

export const CreateAgreementSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  clientId: z.string().uuid('Invalid client ID'),
  fileId: z.string().uuid().optional().nullable(),
  status: z.string().default('Draft'),
});

export const UpdateAgreementSchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
});
