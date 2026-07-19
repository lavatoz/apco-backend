import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

/**
 * Custom AppError class to represent operational errors
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized global error handling middleware
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  // Log error (in a production environment, this would go to a logger like Winston/Pino)
  console.error(`[Error] RequestID: ${requestId} | Path: ${req.path} | Method: ${req.method}`);
  console.error(err);

  // 1. Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      message: 'The request input failed validation checks.',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
      requestId,
    });
    return;
  }

  // 2. Handle Custom Operational AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name || 'Error',
      message: err.message,
      requestId,
    });
    return;
  }

  // 3. Handle Prisma Errors
  if (err.code && err.clientVersion) {
    // Prisma database error (e.g. duplicate key, foreign key failure)
    const prismaCode = err.code;
    const modelName = err.meta?.modelName || (err.message && err.message.match(/on model '([^']+)'/)?.[1]) || 'Unknown';
    const fieldName = err.meta?.target || err.meta?.field_name || 'Unknown';
    
    console.error(`[PRISMA_ERROR] RequestID: ${requestId}`);
    console.error(`  Code: ${prismaCode}`);
    console.error(`  Model: ${modelName}`);
    console.error(`  Fields: ${JSON.stringify(fieldName)}`);
    console.error(`  Metadata: ${JSON.stringify(err.meta || {})}`);
    console.error(`  Stack trace:\n${err.stack || err.message}`);

    res.status(400).json({
      error: 'Database Error',
      message: err.message,
      requestId,
    });
    return;
  }

  // 4. Default: Internal Server Error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred on the server.';
  
  res.status(statusCode).json({
    error: 'Internal Server Error',
    message: env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : message,
    stack: env.NODE_ENV === 'production' ? undefined : err.stack,
    requestId,
  });
}
