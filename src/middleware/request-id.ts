import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request type to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Middleware to generate or forward correlation ID (X-Request-ID)
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check if header already contains Request ID (useful in reverse proxy setups)
  let requestId = req.headers['x-request-id'] || req.headers['X-Request-ID'];
  
  if (!requestId || typeof requestId !== 'string') {
    requestId = crypto.randomUUID();
  }

  // Bind to request context
  req.requestId = requestId;
  
  // Bind to response header
  res.setHeader('X-Request-ID', requestId);

  next();
}
