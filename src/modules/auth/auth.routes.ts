import { Router } from 'express';
import { 
  login, 
  verifyMfaLogin, 
  setupMfa, 
  enableMfa, 
  refresh, 
  logout, 
  changePassword,
  requestPasswordReset,
  confirmPasswordReset,
  requestEmailVerification,
  confirmEmailVerification,
  resendVerificationEmailPublic,
  activateClient
} from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rate-limiters';
import { 
  validateBody 
} from '../../middleware/validation';
import { 
  loginSchema, 
  mfaLoginVerifySchema, 
  mfaVerifySchema, 
  refreshSchema, 
  changePasswordSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  resendVerificationSchema,
  activateClientSchema
} from './auth.validation';

const router = Router();

// Public Authentication Routes
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/mfa/login-verify', authLimiter, validateBody(mfaLoginVerifySchema), verifyMfaLogin);
router.post('/refresh', validateBody(refreshSchema), refresh);
router.post('/logout', validateBody(refreshSchema), logout);
router.post('/activate-client', authLimiter, validateBody(activateClientSchema), activateClient);

// Password Reset Routes
router.post('/password-reset/request', authLimiter, validateBody(passwordResetRequestSchema), requestPasswordReset);
router.post('/password-reset/confirm', authLimiter, validateBody(passwordResetConfirmSchema), confirmPasswordReset);

// Email Verification Routes
// Public confirm (token in query string)
router.get('/email-verification/confirm', confirmEmailVerification);
// Public resend (rate-limited, email only, always returns generic response)
router.post('/email-verification/resend', authLimiter, validateBody(resendVerificationSchema), resendVerificationEmailPublic);

// Protected Authentication Routes
router.post('/mfa/setup', authenticate, setupMfa);
router.post('/mfa/enable', authenticate, validateBody(mfaVerifySchema), enableMfa);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);
router.post('/email-verification/request', authenticate, requestEmailVerification);

export default router;
