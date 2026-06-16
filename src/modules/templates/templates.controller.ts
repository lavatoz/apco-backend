import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { logAudit, extractReqMeta } from '../../services/audit.service';

// --- Agreement Templates ---

export async function getAgreementTemplates(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const templates = await prisma.agreementTemplate.findMany({
      orderBy: { title: 'asc' },
    });
    res.status(200).json(templates);
  } catch (error) {
    next(error);
  }
}

export async function getAgreementTemplateById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const template = await prisma.agreementTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new AppError('Agreement template not found.', 404);
    }

    res.status(200).json(template);
  } catch (error) {
    next(error);
  }
}

export async function createAgreementTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can create agreement templates.', 403);
    }

    const template = await prisma.agreementTemplate.create({
      data: {
        title: body.title,
        body: body.body,
        version: body.version || '1.0.0',
      },
    });

    await logAudit({
      userId: user.id,
      action: 'TEMPLATE_CREATE',
      details: { templateId: template.id, title: template.title },
      ...meta,
    });

    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
}

export async function updateAgreementTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can modify agreement templates.', 403);
    }

    const existing = await prisma.agreementTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Agreement template not found.', 404);
    }

    const updated = await prisma.agreementTemplate.update({
      where: { id },
      data: {
        title: body.title !== undefined ? body.title : existing.title,
        body: body.body !== undefined ? body.body : existing.body,
        version: body.version !== undefined ? body.version : existing.version,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'TEMPLATE_UPDATE',
      details: { templateId: id, title: updated.title },
      ...meta,
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteAgreementTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete agreement templates.', 403);
    }

    const template = await prisma.agreementTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new AppError('Agreement template not found.', 404);
    }

    await prisma.agreementTemplate.delete({
      where: { id },
    });

    await logAudit({
      userId: user.id,
      action: 'TEMPLATE_DELETE',
      details: { templateId: id, title: template.title },
      ...meta,
    });

    res.status(200).json({ message: 'Agreement template deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

// --- Custom Templates ---

export async function getCustomTemplates(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const templates = await prisma.customTemplate.findMany({
      orderBy: { name: 'asc' },
    });
    res.status(200).json(templates);
  } catch (error) {
    next(error);
  }
}

export async function createCustomTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can create custom templates.', 403);
    }

    const template = await prisma.customTemplate.create({
      data: {
        name: body.name,
        type: body.type,
        config: body.config,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'CUSTOM_TEMPLATE_CREATE',
      details: { customTemplateId: template.id, name: template.name },
      ...meta,
    });

    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
}

export async function updateCustomTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can modify custom templates.', 403);
    }

    const existing = await prisma.customTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Custom template not found.', 404);
    }

    const updated = await prisma.customTemplate.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : existing.name,
        type: body.type !== undefined ? body.type : existing.type,
        config: body.config !== undefined ? body.config : existing.config,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'CUSTOM_TEMPLATE_UPDATE',
      details: { customTemplateId: id, name: updated.name },
      ...meta,
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete custom templates.', 403);
    }

    const template = await prisma.customTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new AppError('Custom template not found.', 404);
    }

    await prisma.customTemplate.delete({
      where: { id },
    });

    await logAudit({
      userId: user.id,
      action: 'CUSTOM_TEMPLATE_DELETE',
      details: { customTemplateId: id, name: template.name },
      ...meta,
    });

    res.status(200).json({ message: 'Custom template deleted successfully.' });
  } catch (error) {
    next(error);
  }
}
