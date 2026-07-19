import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { createNotification, NotificationService } from '../../services/notification.service';
import { generateDocumentNumber } from '../../utils/number-generator';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { generateQuotationPdf } from '../../services/quotation-pdf.service';
import { aahaLogoBase64, tinyToesLogoBase64 } from '../../services/default-logo';
import { getOrCreateProjectFolderStructure } from '../../services/google-drive.service';
import { InvoicesService } from './invoices.service';
import { DocumentRegistryService } from '../../services/document-registry.service';

/**
 * Resolves prefix for a project based on its type or falls back to default company
 */
async function resolveCompanyPrefix(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });

  if (project) {
    const company = await prisma.companyProfile.findFirst({
      where: { projectType: project.status || '', deletedAt: null }, // Mock mapping
    });
    if (company) return company.invoicePrefix;
  }

  const defaultCompany = await prisma.companyProfile.findFirst({
    where: { isDefault: true, deletedAt: null },
  });
  return defaultCompany?.invoicePrefix || 'APCO';
}

// =========================================================================
// INVOICES SECTION
// =========================================================================

/**
 * List invoices with leakage protection
 */
export async function getInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    if (
      user.role !== Role.SystemAdmin &&
      user.role !== Role.Manager &&
      user.role !== Role.Client
    ) {
      throw new AppError('Access denied. Financial visibility is restricted.', 403);
    }

    let whereClause: any = { deletedAt: null };

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client) {
        res.status(200).json([]);
        return;
      }
      whereClause.clientId = client.id;
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        client: { select: { id: true, name: true, email: true, companyName: true } },
        project: { select: { id: true, name: true } },
        payments: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(invoices);
  } catch (error) {
    next(error);
  }
}

/**
 * Get Invoice by ID
 */
export async function getInvoiceById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    if (
      user.role !== Role.SystemAdmin &&
      user.role !== Role.Manager &&
      user.role !== Role.Client
    ) {
      throw new AppError('Access denied.', 403);
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, email: true, companyName: true } },
        project: { select: { id: true, name: true } },
        payments: true,
        items: true,
      },
    });

    if (!invoice || invoice.deletedAt) {
      throw new AppError('Invoice not found.', 404);
    }

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({ where: { email: user.email, deletedAt: null } });
      if (!client || invoice.clientId !== client.id) {
        throw new AppError('Access denied.', 403);
      }
    }

    res.status(200).json(invoice);
  } catch (error) {
    next(error);
  }
}

/**
 * Create new invoice
 */
export async function createInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const {
      projectId,
      clientId,
      amount,
      dueDate,
    } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can issue invoices.', 403);
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new AppError('Project not found.', 400);

    const client = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!client) throw new AppError('Client not found.', 400);

    const prefix = await resolveCompanyPrefix(projectId);
    const invoiceNumber = await generateDocumentNumber('INV', prefix);

    const invoice = await InvoicesService.createInvoice(
      req.body,
      project,
      client,
      invoiceNumber
    );

    await logWorkflowEvent({
      projectId,
      eventType: 'INVOICE_ISSUED',
      description: `Invoice ${invoiceNumber} issued for amount $${amount}.`,
      payload: { invoiceId: invoice.id, invoiceNumber, amount },
    });

    const clientUser = await prisma.user.findFirst({ where: { email: client.email } });
    if (clientUser) {
      await createNotification(
        clientUser.id,
        'New Invoice Issued',
        `Invoice ${invoiceNumber} has been generated for project "${project.name}". Due date: ${new Date(dueDate).toLocaleDateString()}.`
      );
    }

    await logAudit({
      userId: user.id,
      action: 'INVOICE_CREATE',
      details: { invoiceId: invoice.id, invoiceNumber },
      ...meta,
    });

    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
}

/**
 * Update invoice
 */
export async function updateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { items, ...fields } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can edit invoices.', 403);
    }

    const existing = await prisma.invoice.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('Invoice not found.', 404);

    const invoice = await prisma.$transaction(async (tx) => {
      // Recreate line items
      await tx.invoiceItem.deleteMany({
        where: { invoiceId: id }
      });

      return tx.invoice.update({
        where: { id },
        data: {
          ...fields,
          dueDate: fields.dueDate ? new Date(fields.dueDate) : undefined,
          items: items ? {
            create: items.map((item: any) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
            }))
          } : undefined
        },
        include: {
          items: true,
          payments: true
        }
      });
    });

    await logAudit({
      userId: user.id,
      action: 'INVOICE_UPDATE',
      details: { invoiceId: id, updatedFields: Object.keys(fields) },
      ...meta,
    });

    res.status(200).json(invoice);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete Invoice (Soft Delete)
 */
export async function deleteInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete invoices.', 403);
    }

    const existing = await prisma.invoice.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('Invoice not found.', 404);

    await prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: user.id,
      action: 'INVOICE_DELETE',
      details: { invoiceId: id },
      ...meta,
    });

    res.status(200).json({ message: 'Invoice deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

// =========================================================================
// QUOTATIONS SECTION
// =========================================================================

/**
 * List quotations with leakage protection
 */
export async function getQuotations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    if (
      user.role !== Role.SystemAdmin &&
      user.role !== Role.Manager &&
      user.role !== Role.Client
    ) {
      throw new AppError('Access denied.', 403);
    }

    let whereClause: any = { deletedAt: null };

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({ where: { email: user.email, deletedAt: null } });
      if (!client) {
        res.status(200).json([]);
        return;
      }
      whereClause.clientId = client.id;
    }

    const quotations = await prisma.quotation.findMany({
      where: whereClause,
      include: {
        client: { select: { id: true, name: true, email: true, companyName: true } },
        project: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(quotations);
  } catch (error) {
    next(error);
  }
}

/**
 * Get Quotation by ID
 */
export async function getQuotationById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    if (
      user.role !== Role.SystemAdmin &&
      user.role !== Role.Manager &&
      user.role !== Role.Client
    ) {
      throw new AppError('Access denied.', 403);
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, email: true, companyName: true } },
        project: { select: { id: true, name: true } },
        items: true,
      },
    });

    if (!quotation || quotation.deletedAt) {
      throw new AppError('Quotation not found.', 404);
    }

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({ where: { email: user.email, deletedAt: null } });
      if (!client || quotation.clientId !== client.id) {
        throw new AppError('Access denied.', 403);
      }
    }

    res.status(200).json(quotation);
  } catch (error) {
    next(error);
  }
}

/**
 * Create new quotation
 */
export async function createQuotation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const {
      projectId,
      clientId,
      amount,
    } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can issue quotations.', 403);
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new AppError('Project not found.', 400);

    const client = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!client) throw new AppError('Client not found.', 400);

    const prefix = await resolveCompanyPrefix(projectId);
    const quotationNumber = await generateDocumentNumber('QUO', prefix);

    const quotation = await InvoicesService.createQuotation(
      req.body,
      project,
      client,
      quotationNumber
    );

    await logWorkflowEvent({
      projectId,
      eventType: 'QUOTATION_ISSUED',
      description: `Quotation ${quotationNumber} was prepared for amount $${amount}.`,
      payload: { quotationId: quotation.id, quotationNumber, amount },
    });

    await logAudit({
      userId: user.id,
      action: 'QUOTATION_CREATE',
      details: { quotationId: quotation.id, quotationNumber },
      ...meta,
    });

    res.status(201).json(quotation);
  } catch (error) {
    next(error);
  }
}

/**
 * Update quotation
 */
export async function updateQuotation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { items, ...fields } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can edit quotations.', 403);
    }

    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('Quotation not found.', 404);

    const quotation = await prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({
        where: { quotationId: id }
      });

      return tx.quotation.update({
        where: { id },
        data: {
          ...fields,
          validUntil: fields.validUntil ? new Date(fields.validUntil) : undefined,
          items: items ? {
            create: items.map((item: any) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
            }))
          } : undefined
        },
        include: {
          items: true
        }
      });
    });

    if (quotation.status === 'Approved' || quotation.status === 'Accepted' || quotation.status === 'ACCEPTED') {
      try {
        const { StandaloneAgreementsService } = require('../standalone-agreements/standalone-agreements.service');
        await StandaloneAgreementsService.acceptQuotation(id);
      } catch (agrErr) {
        console.error('[Quotation Update] Auto agreement assignment log:', agrErr);
      }
    }

    await logAudit({
      userId: user.id,
      action: 'QUOTATION_UPDATE',
      details: { quotationId: id },
      ...meta,
    });

    res.status(200).json(quotation);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete quotation (Soft Delete)
 */
export async function deleteQuotation(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { id } = req.params;
  console.log(`[DELETE QUOTATION] Delete request received for ID: ${id}`);

  try {
    const user = req.user!;
    const meta = extractReqMeta(req);

    // 1. Permission check
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      const errMsg = 'Only administrators or managers can delete quotations.';
      console.warn(`[DELETE QUOTATION] Permission issue: ${errMsg} User: ${user.id}, Role: ${user.role}`);
      throw new AppError(errMsg, 403);
    }

    // 2. Record check
    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      const errMsg = 'Quotation not found or already deleted.';
      console.warn(`[DELETE QUOTATION] Record not found: ${errMsg} ID: ${id}`);
      throw new AppError(errMsg, 404);
    }

    // 3. Soft delete operation
    console.log(`[DELETE QUOTATION] Soft deleting quotation ${id} in database...`);
    await prisma.quotation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: user.id,
      action: 'QUOTATION_DELETE',
      details: { quotationId: id },
      ...meta,
    });

    console.log(`[DELETE QUOTATION] Quotation ${id} soft deleted successfully.`);
    res.status(200).json({ message: 'Quotation deleted successfully.' });
  } catch (error: any) {
    console.error(`[DELETE QUOTATION] Deletion failed for ID ${id}. Error: ${error.message || error}`);
    
    // Check if it's a known Prisma error or database constraint
    if (error.code === 'P2003') {
      const errMsg = 'Quotation deletion blocked by a foreign key constraint.';
      console.error(`[DELETE QUOTATION] Foreign key constraint error: ${errMsg}`);
      return next(new AppError(errMsg, 409));
    }
    
    next(error);
  }
}

// =========================================================================
// AGREEMENTS SECTION
// =========================================================================

/**
 * List agreements with leakage protection
 */
export async function getAgreements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    if (
      user.role !== Role.SystemAdmin &&
      user.role !== Role.Manager &&
      user.role !== Role.Client
    ) {
      throw new AppError('Access denied.', 403);
    }

    let whereClause: any = { deletedAt: null };

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({ where: { email: user.email, deletedAt: null } });
      if (!client) {
        res.status(200).json([]);
        return;
      }
      whereClause.clientId = client.id;
    }

    const agreements = await prisma.agreement.findMany({
      where: whereClause,
      include: {
        client: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        file: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(agreements);
  } catch (error) {
    next(error);
  }
}

/**
 * Create new agreement
 */
export async function createAgreement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { projectId, clientId, fileId, status } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can issue agreements.', 403);
    }

    const prefix = await resolveCompanyPrefix(projectId);
    const agreementNumber = await generateDocumentNumber('AGR', prefix);

    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        projectId,
        clientId,
        fileId,
        status,
      },
    });

    await logWorkflowEvent({
      projectId,
      eventType: 'AGREEMENT_CREATED',
      description: `Agreement ${agreementNumber} was created in status "${status}".`,
      payload: { agreementId: agreement.id, agreementNumber, status },
    });

    await logAudit({
      userId: user.id,
      action: 'AGREEMENT_CREATE',
      details: { agreementId: agreement.id, agreementNumber },
      ...meta,
    });

    res.status(201).json(agreement);
  } catch (error) {
    next(error);
  }
}

// =========================================================================
// PAYMENTS SECTION
// =========================================================================

/**
 * Record payment transaction
 */
export async function recordPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: invoiceId } = req.params;
    const { amount, status, paymentMethod, transactionId } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can log payment actions.', 403);
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId, deletedAt: null },
      include: { project: true, payments: true },
    });

    if (!invoice) throw new AppError('Invoice record not found.', 404);

    const payment = await prisma.payment.create({
      data: {
        amount,
        status,
        paymentMethod,
        transactionId,
        invoiceId,
      },
    });

    if (status.toUpperCase() === 'SUCCESSFUL' || status.toUpperCase() === 'PAID') {
      await logWorkflowEvent({
        projectId: invoice.projectId,
        eventType: 'PAYMENT_RECEIVED',
        description: `Payment of $${amount} was received for invoice ${invoice.invoiceNumber}.`,
        payload: { paymentId: payment.id, amount, paymentMethod },
      });

      // Calculate total paid including the new payment
      const paymentsList = invoice.payments || [];
      const existingPaid = paymentsList
        .filter(p => p.status.toUpperCase() === 'SUCCESSFUL' || p.status.toUpperCase() === 'PAID')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const totalPaid = existingPaid + Number(amount);

      // Determine new invoice status
      const totalInvoiceAmount = Number(invoice.amount || 0);
      let newInvoiceStatus = 'Paid';
      if (totalInvoiceAmount > 0 && totalPaid < totalInvoiceAmount) {
        newInvoiceStatus = 'Partial';
      }

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: newInvoiceStatus },
      });

      const client = await prisma.client.findUnique({ where: { id: invoice.clientId } });
      if (client) {
        const clientUser = await prisma.user.findFirst({ where: { email: client.email } });
        if (clientUser) {
          await NotificationService.emitNotification(clientUser.id, {
            title: 'Payment Confirmed',
            message: `Thank you! We received your payment of $${amount} for invoice ${invoice.invoiceNumber}.`
          });
        }
      }

      try {
        await NotificationService.emitToRole(Role.SystemAdmin, {
          title: 'Payment Received',
          message: `Payment of $${amount} was logged successfully for invoice ${invoice.invoiceNumber}.`,
        });
        await NotificationService.emitToRole(Role.Manager, {
          title: 'Payment Received',
          message: `Payment of $${amount} was logged successfully for invoice ${invoice.invoiceNumber}.`,
        });
      } catch (roleError) {
        console.error('Failed to notify staff about payment:', roleError);
      }
    }

    await logAudit({
      userId: user.id,
      action: 'PAYMENT_RECORD',
      details: { paymentId: payment.id, invoiceId, amount },
      ...meta,
    });

    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
}

/**
 * Generates dynamic, custom styled dark-mode quotation PDF and uploads to GDrive
 */
export async function generateQuotationPdfController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const meta = extractReqMeta(req);

    // 1. RBAC Check (Only Admins and Managers allowed)
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can generate quotation PDFs.', 403);
    }

    // 2. Fetch Quotation with items and project/client info
    const quotation = await prisma.quotation.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: true,
        project: true,
        client: true,
      },
    });

    if (!quotation) {
      throw new AppError('Quotation not found.', 404);
    }

    // 3. Resolve active brand profile and logo
    let brandProfile = null;
    if (quotation.brandId) {
      brandProfile = await prisma.companyProfile.findFirst({
        where: { id: quotation.brandId, deletedAt: null },
      });
    }

    if (!brandProfile && quotation.brand) {
      brandProfile = await prisma.companyProfile.findFirst({
        where: { companyName: quotation.brand, deletedAt: null },
      });
    }

    const activeBrandName = brandProfile?.companyName || quotation.brand || undefined;

    // Fetch default company profile to get fallback bank details
    const companyProfile = await prisma.companyProfile.findFirst({
      where: { isDefault: true, deletedAt: null },
    });

    // Brand Resolution Order:
    // 1. Active Brand Logo from Brand Profile (brandId matched, or brand name matched if brandId is unavailable)
    // 2. Parent Company Logo (Artisans Production Company - default company profile)
    // 3. Brand-Specific Fallback Logo (Aaha Kalyanam / Tiny Toes)
    // 4. Existing Text Branding (logo remains undefined, text fallback is rendered)
    let companyLogoUrl: string | undefined = undefined;

    if (brandProfile?.logo) {
      companyLogoUrl = brandProfile.logo;
    } else if (companyProfile?.logo) {
      companyLogoUrl = companyProfile.logo;
    } else if (activeBrandName) {
      const normalized = activeBrandName.toLowerCase();
      if (normalized.includes('aaha')) {
        companyLogoUrl = aahaLogoBase64;
      } else if (normalized.includes('tiny toes')) {
        companyLogoUrl = tinyToesLogoBase64;
      }
    }

    // 4. Fetch client events for event details resolution
    // Event resolution priority:
    // 1. Linked event from Task table (where projectId matches and eventId is not null)
    let resolvedEvent = null;
    const taskWithEvent = await prisma.task.findFirst({
      where: { projectId: quotation.projectId, eventId: { not: null } },
      include: { event: true },
    });
    if (taskWithEvent && taskWithEvent.event) {
      resolvedEvent = taskWithEvent.event;
    }

    const clientEvents = await prisma.event.findMany({
      where: { clientId: quotation.clientId },
      orderBy: { date: 'asc' },
    });

    // 2. Fallback: Search client events using keyword matching (wedding or muhurtham)
    if (!resolvedEvent) {
      resolvedEvent = clientEvents.find((e) =>
        e.name.toLowerCase().includes('wedding') ||
        e.name.toLowerCase().includes('muhurtham')
      );
    }

    // 3. Second Fallback: Use the earliest chronological client event
    if (!resolvedEvent && clientEvents.length > 0) {
      resolvedEvent = clientEvents[0];
    }

    const weddingDate = resolvedEvent?.date
      ? resolvedEvent.date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
      : undefined;

    const muhurthamTime = resolvedEvent?.startTime && resolvedEvent?.endTime
      ? `${resolvedEvent.startTime} - ${resolvedEvent.endTime}`
      : undefined;

    const weddingVenue = resolvedEvent?.venueLocation || undefined;
    const brideLocation = resolvedEvent?.brideLocation || undefined;
    const groomLocation = resolvedEvent?.groomLocation || undefined;

    const tagline = brandProfile?.tagline || companyProfile?.tagline || undefined;
    const primaryColor = brandProfile?.primaryColor || companyProfile?.primaryColor || undefined;

    // 5. Fetch successful payments logged under the project for calculating advancePaid
    const payments = await prisma.payment.findMany({
      where: {
        invoice: { projectId: quotation.projectId },
        status: { in: ['Paid', 'SUCCESSFUL', 'successful', 'paid', 'Successful'] },
      },
    });
    const advancePaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const balanceAmount = Number(quotation.amount) - advancePaid;

    // 6. Gather formatting parameters
    const issueDate = quotation.createdAt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const validUntil = quotation.validUntil.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Convert quotation items to service format
    const items = quotation.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      amount: Number(item.amount),
    }));

    // Resolve bank details from profile
    let bankDetails = {};
    if (companyProfile && companyProfile.bankDetails) {
      const bd = companyProfile.bankDetails as any;
      bankDetails = {
        accountName: bd.accountName || bd.AccountName || '',
        accountNumber: bd.accountNumber || bd.AccountNumber || '',
        bankName: bd.bankName || bd.BankName || '',
        ifscCode: bd.ifscCode || bd.IfscCode || '',
      };
    }

    // Generate Document ID and Verification URL for the Document Registry (idempotent lookup/creation)
    const resolvedPrefixForDoc = brandProfile?.invoicePrefix || companyProfile?.invoicePrefix || 'APCO';
    const { documentId, verificationUrl } = await DocumentRegistryService.getOrCreateDocumentId(
      quotation.quotationNumber,
      'QUOTATION',
      resolvedPrefixForDoc
    );

    // 7. Generate PDF Buffer using the service
    const pdfBuffer = await generateQuotationPdf({
      quotationNumber: quotation.quotationNumber,
      issueDate,
      validUntil,
      clientName: quotation.client.name,
      clientEmail: quotation.client.email,
      clientPhone: quotation.client.phone || undefined,
      clientAddress: quotation.client.address || undefined,
      clientCompanyName: quotation.client.companyName || undefined,
      items,
      amount: Number(quotation.amount),
      discountType: quotation.discountType || undefined,
      discountValue: quotation.discountValue ? Number(quotation.discountValue) : undefined,
      taxPercent: quotation.taxPercent ? Number(quotation.taxPercent) : undefined,
      shippingCost: quotation.shippingCost ? Number(quotation.shippingCost) : undefined,
      advancePaid,
      balanceAmount,
      upiId: companyProfile?.upiId || undefined,
      companyName: companyProfile?.companyName || 'Artisans Production Company',
      bankDetails,
      companyLogoUrl,
      brandName: activeBrandName,
      weddingDate,
      muhurthamTime,
      weddingVenue,
      brideLocation,
      groomLocation,
      paymentTerms: quotation.paymentTerms || undefined,
      primaryColor,
      tagline,
      templateId: quotation.templateId || undefined,
      themePreset: brandProfile?.themePreset || companyProfile?.themePreset || undefined,
      verificationUrl,
    });

    const sanitizedClientName = quotation.client.name.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Quotation_${quotation.quotationNumber}_${sanitizedClientName}.pdf`;
    const relativeLocalPath = `uploads/quotations/pdfs/${fileName}`;
    const absoluteLocalPath = path.resolve(process.cwd(), relativeLocalPath);

    // 8. Save PDF locally as primary storage source
    const dirPath = path.dirname(absoluteLocalPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(absoluteLocalPath, pdfBuffer);

    // 9. Optional Google Drive upload (isolated try/catch)
    let driveFile: any = null;
    let quotationsFolderId = quotation.project?.quotationsFolderId;
    try {
      const folderStructure = await getOrCreateProjectFolderStructure(
        quotation.client.name,
        quotation.project.name,
        {
          driveFolderId: quotation.project.driveFolderId,
          agreementsFolderId: quotation.project.agreementsFolderId,
          quotationsFolderId: quotation.project.quotationsFolderId,
          invoicesFolderId: quotation.project.invoicesFolderId,
          galleryFolderId: quotation.project.galleryFolderId,
          deliverablesFolderId: quotation.project.deliverablesFolderId,
        }
      );

      if (folderStructure.quotationsFolderId !== quotation.project.quotationsFolderId) {
        await prisma.project.update({
          where: { id: quotation.projectId },
          data: {
            quotationsFolderId: folderStructure.quotationsFolderId,
          },
        });
      }
      quotationsFolderId = folderStructure.quotationsFolderId;
    } catch (folderErr) {
      console.error('[Quotation PDF] Google Drive folder resolution failed or optional skipped:', folderErr);
    }

    try {
      const googleDriveService = require('../../services/google-drive.service');
      driveFile = await googleDriveService.uploadFile(
        pdfBuffer,
        fileName,
        'application/pdf',
        quotationsFolderId || undefined
      );
    } catch (uploadErr) {
      console.error('[Quotation PDF] Google Drive upload failed or optional skipped:', uploadErr);
    }

    // 10. Register generated PDF file in File table with local file path as key
    const existingFile = await prisma.file.findUnique({
      where: {
        key: relativeLocalPath,
      },
    });
    const fileRecord = existingFile
      ? existingFile
      : await prisma.file.create({
        data: {
          key: relativeLocalPath,
          originalName: fileName,
          mimeType: 'application/pdf',
          size: pdfBuffer.length,
          hash: require('crypto').createHash('sha256').update(pdfBuffer).digest('hex'),
          isSecured: false,
          projectId: quotation.projectId,
          userId: user.id,
          googleDriveFileId: driveFile?.id || null,
          googleDriveViewLink: driveFile?.webViewLink || null,
          category: 'Quotations',
        },
      });

    // Register document in the Document Registry
    await DocumentRegistryService.registerDocument(documentId, {
      documentNumber: quotation.quotationNumber,
      documentType: 'QUOTATION',
      clientId: quotation.clientId,
      projectId: quotation.projectId,
      companyId: brandProfile?.id || companyProfile?.id || null,
      sha256Hash: fileRecord.hash,
    });

    // 11. Write timeline event and audit logs
    await logWorkflowEvent({
      projectId: quotation.projectId,
      eventType: 'QUOTATION_GENERATED',
      description: `Quotation PDF ${quotation.quotationNumber} was generated successfully.`,
      payload: { quotationId: quotation.id, quotationNumber: quotation.quotationNumber, fileId: fileRecord.id },
    });

    await logAudit({
      userId: user.id,
      action: 'QUOTATION_GENERATE_PDF',
      details: { quotationId: quotation.id, quotationNumber: quotation.quotationNumber, fileId: fileRecord.id },
      ...meta,
    });

    res.status(201).json({
      success: true,
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      fileId: fileRecord.id,
      fileName: fileRecord.originalName,
      viewLink: driveFile?.webViewLink || null,
    });
  } catch (error) {
    next(error);
  }
}
