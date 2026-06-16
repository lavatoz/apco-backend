import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { hashPassword } from '../../utils/hash';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logSecurityEvent } from '../../services/security-event.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';

/**
 * Get all users (Staff Management)
 */
export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requestingUser = req.user!;

    // Restrict list to SystemAdmin and Manager
    if (requestingUser.role !== Role.SystemAdmin && requestingUser.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can list users.', 403);
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        mustChangePassword: true,
        mfaEnabled: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        setupToken: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
}

/**
 * Get own or specific user details
 */
export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const requestingUser = req.user!;

    // Allow user to get their own details, but restrict other profiles to Admin/Manager
    if (requestingUser.id !== id && requestingUser.role !== Role.SystemAdmin && requestingUser.role !== Role.Manager) {
      throw new AppError('You do not have permission to view this user profile.', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        mustChangePassword: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('User profile not found.', 404);
    }

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new user (Manager/Admin only)
 */
export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requestingUser = req.user!;
    const { email, password, firstName, lastName, role } = req.body;
    const meta = extractReqMeta(req);

    // Limit creation privileges
    if (requestingUser.role !== Role.SystemAdmin && requestingUser.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can create new users.', 403);
    }

    // Check duplicate email
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError('Email address is already in use.', 400);
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        mustChangePassword: true, // Force password change on first login
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    await logAudit({
      userId: requestingUser.id,
      action: 'USER_CREATE',
      details: { createdUserId: newUser.id, createdUserEmail: newUser.email, role: newUser.role },
      ...meta,
    });

    res.status(201).json(newUser);
  } catch (error) {
    next(error);
  }
}

/**
 * Update user details (Self update or Admin/Manager update)
 */
export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const requestingUser = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    // RBAC: Self profile update is allowed. Role/Status changes are Admin/Manager only.
    const isSelf = requestingUser.id === id;
    const isAdminOrManager = requestingUser.role === Role.SystemAdmin || requestingUser.role === Role.Manager;

    if (!isSelf && !isAdminOrManager) {
      throw new AppError('You do not have permission to update this user profile.', 403);
    }

    // Filter out fields if updating self and not admin/manager (prevent self-escalation)
    if (isSelf && !isAdminOrManager) {
      delete body.role;
      delete body.mustChangePassword;
    }

    // Resolve update data
    const updateData: any = { ...body };
    if (body.password) {
      updateData.passwordHash = await hashPassword(body.password);
      delete updateData.password;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        mustChangePassword: true,
        updatedAt: true,
      },
    });

    await logAudit({
      userId: requestingUser.id,
      action: 'USER_UPDATE',
      details: { updatedUserId: id, fields: Object.keys(updateData) },
      ...meta,
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    next(error);
  }
}

/**
 * Lock user account / terminate sessions (Delete conceptually)
 */
export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const requestingUser = req.user!;
    const meta = extractReqMeta(req);

    if (requestingUser.role !== Role.SystemAdmin && requestingUser.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can lock user accounts.', 403);
    }

    // Prevent deleting oneself
    if (requestingUser.id === id) {
      throw new AppError('You cannot delete your own account.', 400);
    }

    // Lock user by setting lockedUntil way into the future
    await prisma.user.update({
      where: { id },
      data: {
        lockedUntil: new Date('2099-12-31T23:59:59Z'),
      },
    });

    // Revoke all tokens and sessions
    await prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { isRevoked: true },
    });

    await prisma.userSession.deleteMany({
      where: { userId: id },
    });

    await logSecurityEvent({
      userId: requestingUser.id,
      eventType: 'SESSION_REVOCATION',
      details: { revokedUserId: id },
      ...meta,
    });

    await logAudit({
      userId: requestingUser.id,
      action: 'USER_LOCK',
      details: { lockedUserId: id },
      ...meta,
    });

    res.status(200).json({ message: 'User account has been locked and all active sessions revoked.' });
  } catch (error) {
    next(error);
  }
}
