import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';

/**
 * Get all company profiles (soft delete filtered)
 */
export async function getCompanies(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const companies = await prisma.companyProfile.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json(companies);
  } catch (error) {
    next(error);
  }
}

/**
 * Save/Update company profile
 */
export async function saveCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Enforce Admin/Manager role
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can modify company profiles.', 403);
    }

    let company;

    if (id) {
      // Update
      const existing = await prisma.companyProfile.findUnique({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new AppError('Company profile not found.', 404);
      }

      company = await prisma.companyProfile.update({
        where: { id },
        data: body,
      });

      await logAudit({
        userId: user.id,
        action: 'COMPANY_UPDATE',
        details: { companyId: company.id, companyName: company.companyName },
        ...meta,
      });
    } else {
      // Create
      company = await prisma.companyProfile.create({
        data: body,
      });

      await logAudit({
        userId: user.id,
        action: 'COMPANY_CREATE',
        details: { companyId: company.id, companyName: company.companyName },
        ...meta,
      });
    }

    // If marked as default, unset other defaults
    if (body.isDefault) {
      await prisma.companyProfile.updateMany({
        where: { id: { not: company.id } },
        data: { isDefault: false },
      });
    }

    res.status(200).json(company);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete company profile (soft delete)
 */
export async function deleteCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Enforce Admin/Manager
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete company profiles.', 403);
    }

    const company = await prisma.companyProfile.findUnique({
      where: { id, deletedAt: null },
    });

    if (!company) {
      throw new AppError('Company profile not found.', 404);
    }

    await prisma.companyProfile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: user.id,
      action: 'COMPANY_DELETE',
      details: { companyId: id, companyName: company.companyName },
      ...meta,
    });

    res.status(200).json({ message: 'Company profile deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all global settings (Filters out sensitive passwords for non-admins)
 */
export async function getGlobalSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const settings = await prisma.globalSetting.findMany();

    const result: Record<string, string> = {};
    for (const setting of settings) {
      // Leakage protection: hide passwords if user is not SystemAdmin or Manager
      const isSensitive = setting.key.toLowerCase().includes('password') || setting.key.toLowerCase().includes('secret') || setting.key.toLowerCase().includes('key');
      const hasPermission = user.role === Role.SystemAdmin || user.role === Role.Manager;

      if (!isSensitive || hasPermission) {
        result[setting.key] = setting.value;
      }
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Bulk save settings
 */
export async function saveGlobalSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as Record<string, string>;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Enforce Admin/Manager
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can update global settings.', 403);
    }

    const upsertPromises = Object.entries(body).map(([key, value]) => {
      return prisma.globalSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    });

    await Promise.all(upsertPromises);

    await logAudit({
      userId: user.id,
      action: 'SETTINGS_UPDATE',
      details: { keys: Object.keys(body) },
      ...meta,
    });

    res.status(200).json({ message: 'Settings saved successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single company profile by ID
 */
export async function getCompanyById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const company = await prisma.companyProfile.findUnique({
      where: { id, deletedAt: null },
    });

    if (!company) {
      throw new AppError('Company profile not found.', 404);
    }

    res.status(200).json(company);
  } catch (error) {
    next(error);
  }
}

