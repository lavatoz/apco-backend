import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { generateAgreementPdf } from '../../services/agreement-pdf.service';
import { uploadFile, getOrCreateProjectFolderStructure } from '../../services/google-drive.service';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';

/**
 * POST /api/agreements/generate/:projectId
 * Generates agreement PDF, uploads to Google Drive, and saves db records.
 */
export async function generateProjectAgreement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { projectId } = req.params;
    const meta = extractReqMeta(req);

    // 1. RBAC Check (Only Admins and Managers allowed)
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can generate agreements.', 403);
    }

    // 2. Fetch Project & Client
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { client: true },
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // 3. Fetch Quotation & Invoice information for placeholders
    const quotation = await prisma.quotation.findFirst({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const invoice = await prisma.invoice.findFirst({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // 4. Fetch successful payments logged for project
    const payments = await prisma.payment.findMany({
      where: {
        invoice: { projectId },
        status: { in: ['Paid', 'SUCCESSFUL', 'Paid', 'successful', 'paid', 'Successful'] },
      },
    });
    const advancePaidSum = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    // 5. Find linked events for placeholder names/dates
    const taskWithEvent = await prisma.task.findFirst({
      where: { projectId, eventId: { not: null } },
      include: { event: true },
    });

    let defaultEventName = taskWithEvent?.event?.name;
    let defaultEventDate = '';
    if (taskWithEvent?.event?.date) {
      defaultEventDate = new Date(taskWithEvent.event.date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }

    if (!defaultEventName) {
      const firstEvent = await prisma.event.findFirst({
        where: { clientId: project.clientId },
        orderBy: { date: 'asc' },
      });
      defaultEventName = firstEvent?.name || project.name;
      defaultEventDate = firstEvent?.date
        ? new Date(firstEvent.date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          });
    }

    // Resolve specific values (favor request body override over DB fallback)
    const clientName = req.body.clientName || project.client.name;
    const eventName = req.body.eventName || defaultEventName;
    const eventDate = req.body.eventDate || defaultEventDate;

    const totalAmountVal = req.body.totalAmount !== undefined 
      ? Number(req.body.totalAmount) 
      : (quotation ? Number(quotation.amount) : (invoice ? Number(invoice.amount) : 0));
    
    const advanceAmountVal = req.body.advanceAmount !== undefined 
      ? Number(req.body.advanceAmount) 
      : advancePaidSum;

    const balanceAmountVal = req.body.balanceAmount !== undefined 
      ? Number(req.body.balanceAmount) 
      : (totalAmountVal - advanceAmountVal);

    const formattedTotal = `Rs. ${totalAmountVal.toLocaleString('en-IN')}`;
    const formattedAdvance = `Rs. ${advanceAmountVal.toLocaleString('en-IN')}`;
    const formattedBalance = `Rs. ${balanceAmountVal.toLocaleString('en-IN')}`;

    const todayDate = req.body.todayDate || new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // 6. Generate PDF Buffer
    const pdfBuffer = await generateAgreementPdf({
      clientName,
      eventName,
      eventDate,
      totalAmount: formattedTotal,
      advanceAmount: formattedAdvance,
      balanceAmount: formattedBalance,
      todayDate,
    });

    // 7. Ensure GDrive Project Folder exists & resolve Agreements folder
    const folderStructure = await getOrCreateProjectFolderStructure(
      project.client.name,
      project.name,
      {
        driveFolderId: project.driveFolderId,
        agreementsFolderId: project.agreementsFolderId,
        quotationsFolderId: project.quotationsFolderId,
        invoicesFolderId: project.invoicesFolderId,
        galleryFolderId: project.galleryFolderId,
        deliverablesFolderId: project.deliverablesFolderId,
      }
    );

    // Save newly created folder IDs in database if they were updated
    const hasFolderChanges =
      folderStructure.driveFolderId !== project.driveFolderId ||
      folderStructure.agreementsFolderId !== project.agreementsFolderId;

    if (hasFolderChanges) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          driveFolderId: folderStructure.driveFolderId,
          agreementsFolderId: folderStructure.agreementsFolderId,
        },
      });
    }

    // 8. Generate atomic counter-based AGR agreement number: AGR-{YEAR}-{SEQUENCE}
    const year = new Date().getFullYear();
    const counterResult = await prisma.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
      VALUES ('AGR', 'AGR_SEQ', ${year}, 1)
      ON CONFLICT ("prefix", "type", "year")
      DO UPDATE SET "lastValue" = "DocumentCounter"."lastValue" + 1
      RETURNING "lastValue";
    `;
    const sequenceValue = counterResult[0]?.lastValue ?? 1;
    const formattedSeq = String(sequenceValue).padStart(4, '0');
    const agreementNumber = `AGR-${year}-${formattedSeq}`;

    const fileName = `Agreement_${agreementNumber}_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // 9. Upload PDF buffer to Google Drive Agreements subfolder
    const driveFile = await uploadFile(
      pdfBuffer,
      fileName,
      'application/pdf',
      folderStructure.agreementsFolderId || undefined
    );

    // 10. Register generated PDF file in File table
    const fileRecord = await prisma.file.create({
      data: {
        key: `gdrive-${driveFile.id}`,
        originalName: fileName,
        mimeType: 'application/pdf',
        size: pdfBuffer.length,
        hash: crypto.createHash('sha256').update(pdfBuffer).digest('hex'),
        isSecured: false,
        projectId,
        userId: user.id,
        googleDriveFileId: driveFile.id,
        googleDriveViewLink: driveFile.webViewLink,
        category: 'Agreements',
      },
    });

    // 11. Create Agreement record in status 'Generated'
    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        projectId,
        clientId: project.clientId,
        fileId: fileRecord.id,
        status: 'Generated',
      },
    });

    // 12. Write workflow timeline and audit logs
    await logWorkflowEvent({
      projectId,
      eventType: 'AGREEMENT_GENERATED',
      description: `Agreement ${agreementNumber} was generated in status "Generated".`,
      payload: { agreementId: agreement.id, agreementNumber, fileId: fileRecord.id },
    });

    await logAudit({
      userId: user.id,
      action: 'AGREEMENT_GENERATE',
      details: { agreementId: agreement.id, agreementNumber, fileId: fileRecord.id },
      ...meta,
    });

    // 13. Return Generated metadata
    res.status(201).json({
      success: true,
      agreementId: agreement.id,
      agreementNumber: agreement.agreementNumber,
      status: agreement.status,
      fileId: fileRecord.id,
      fileName: fileRecord.originalName,
      viewLink: driveFile.webViewLink,
    });
  } catch (error) {
    next(error);
  }
}
