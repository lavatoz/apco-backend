import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { createNotification, NotificationService } from '../../services/notification.service';
import { generateDocumentNumber } from '../../utils/number-generator';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';

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
      status, 
      dueDate,
      discountValue,
      discountType,
      taxPercent,
      shippingCost,
      notes,
      termsSummary,
      companyLogoUrl,
      paymentTerms,
      templateId,
      templateVersion,
      brandId,
      brand,
      items
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

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        projectId,
        clientId,
        amount,
        status,
        dueDate: new Date(dueDate),
        discountValue,
        discountType,
        taxPercent,
        shippingCost,
        notes,
        termsSummary,
        companyLogoUrl,
        paymentTerms,
        templateId,
        templateVersion,
        brandId,
        brand,
        items: items && items.length > 0 ? {
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
      }
    });

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
      status, 
      validUntil,
      discountValue,
      discountType,
      taxPercent,
      shippingCost,
      notes,
      termsSummary,
      companyLogoUrl,
      paymentTerms,
      templateId,
      templateVersion,
      brandId,
      brand,
      items
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

    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber,
        projectId,
        clientId,
        amount,
        status,
        validUntil: new Date(validUntil),
        discountValue,
        discountType,
        taxPercent,
        shippingCost,
        notes,
        termsSummary,
        companyLogoUrl,
        paymentTerms,
        templateId,
        templateVersion,
        brandId,
        brand,
        items: items && items.length > 0 ? {
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
      }
    });

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
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete quotations.', 403);
    }

    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('Quotation not found.', 404);

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

    res.status(200).json({ message: 'Quotation deleted successfully.' });
  } catch (error) {
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
