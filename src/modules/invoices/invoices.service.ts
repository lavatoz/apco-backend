import { prisma } from '../../config/database';
import { DisplayIdGenerator } from '../../services/display-id.service';

export class InvoicesService {
  static async createInvoice(
     body: any,
     _project: any,
     _client: any,
     invoiceNumber: string
   ) {
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
    } = body;

    const invoiceCode = await DisplayIdGenerator.getNextId('INV');

    return prisma.invoice.create({
      data: {
        invoiceNumber,
        invoiceCode,
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
  }

  static async createQuotation(
     body: any,
     _project: any,
     _client: any,
     quotationNumber: string
   ) {
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
    } = body;

    const quotationCode = await DisplayIdGenerator.getNextId('QUO');

    return prisma.quotation.create({
      data: {
        quotationNumber,
        quotationCode,
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
  }
}
