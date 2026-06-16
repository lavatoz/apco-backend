import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV === 'development';

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('RATE LIMIT DEV MODE:', isDev);

/**
 * Global rate limiting handler returning consistent error formats
 */
const limitHandler = (req: any, res: any, _next: any, options: any) => {
  res.status(options.statusCode).json({
    error: 'Too Many Requests',
    message: options.message,
    requestId: req.requestId,
  });
};

/**
 * Authentication Limiter: 5 requests / 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDev ? 1000 : 5,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
  handler: limitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API Limiter: 100 requests / minute
 */
export const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: isDev ? 1000 : 100,
  message: 'Too many requests. Rate limit is 100 requests per minute.',
  handler: limitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * File Downloads Limiter: 30 requests / minute
 */
export const downloadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: isDev ? 1000 : 30,
  message: 'Too many file download requests. Rate limit is 30 requests per minute.',
  handler: limitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

