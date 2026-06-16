import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

interface AccessTokenPayload {
  userId: string;
  role: string;
}

interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // unique ID to identify the token structure
}

/**
 * Computes SHA-256 hash of a string.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically secure random token string for refresh token.
 */
export function generateRandomToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Signs a JWT Access Token.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

/**
 * Signs a JWT Refresh Token.
 */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: '30d',
  });
}

/**
 * Verifies JWT Access Token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

/**
 * Verifies JWT Refresh Token.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
