import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';

/**
 * List expenses with role-based restriction and leakage protection
 */
export async function getExpenses(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    // Query-level RBAC: Clients only see expenses associated with their client ID
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

    const expenses = await prisma.expense.findMany({
      where: whereClause,
      include: {
        client: { select: { id: true, name: true, email: true, companyName: true } }
      },
      orderBy: { date: 'desc' },
    });

    res.status(200).json(expenses);
  } catch (error) {
    next(error);
  }
}

/**
 * Create new expense
 */
export async function createExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { description, amount, category, date, clientId, brand, divisionId } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can log expenses.', 403);
    }

    // Optional client verify
    if (clientId) {
      const client = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
      if (!client) throw new AppError('Client not found.', 400);
    }

    const expense = await prisma.expense.create({
      data: {
        description,
        amount,
        category,
        date: new Date(date),
        clientId,
        brand,
        divisionId,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'EXPENSE_CREATE',
      details: { expenseId: expense.id, amount },
      ...meta,
    });

    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
}

/**
 * Update expense
 */
export async function updateExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can edit expenses.', 403);
    }

    const existing = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('Expense not found.', 404);

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...body,
        date: body.date ? new Date(body.date) : undefined,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'EXPENSE_UPDATE',
      details: { expenseId: id, updatedFields: Object.keys(body) },
      ...meta,
    });

    res.status(200).json(expense);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete expense (Soft Delete)
 */
export async function deleteExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete expenses.', 403);
    }

    const existing = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('Expense not found.', 404);

    await prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: user.id,
      action: 'EXPENSE_DELETE',
      details: { expenseId: id },
      ...meta,
    });

    res.status(200).json({ message: 'Expense deleted successfully.' });
  } catch (error) {
    next(error);
  }
}
