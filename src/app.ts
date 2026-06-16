import './config/env'; // Load env variables first
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestIdMiddleware } from './middleware/request-id';
import { generalLimiter } from './middleware/rate-limiters';
import { errorHandler } from './middleware/error';
import routes from './routes';
import { env } from './config/env';

const app = express();

// Temporary request logging middleware
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  console.log(`User-Agent: ${req.headers['user-agent'] || ''}`);
  console.log(`IP: ${req.ip}`);
  next();
});

// 1. Secure Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: 'deny', // X-Frame-Options: DENY
    },
    noSniff: true, // X-Content-Type-Options: nosniff
  })
);

// 2. CORS Configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Correlation-ID'
    ],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
  })
);

// 3. Request Correlation ID
app.use(requestIdMiddleware);

// 4. Request Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Global API Rate Limiting (Applied to all routes under /api except specific overrides if any)
app.use('/api', generalLimiter);

// 6. Centralized API Router
app.use('/api', routes);

// 7. Route Not Found (404) Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    requestId: req.requestId,
  });
});

// 8. Global Centralized Error Handler
app.use(errorHandler);

export default app;
