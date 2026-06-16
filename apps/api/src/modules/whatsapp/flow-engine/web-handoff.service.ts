/**
 * Web Handoff Service
 * Generates and validates signed JWT tokens for web handoff steps in WhatsApp flows.
 * Token links a WhatsApp session to a web page the user must complete.
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import type {
  WebHandoffLinkMessage,
  WebHandoffTokenClaims,
} from '../../../types/tribe-flows.types';

const CAVE_URL = process.env['CAVE_URL'] ?? '';
const TOKEN_TTL_MINUTES = 60;

function getSecret(): string {
  const secret = process.env['WEB_HANDOFF_SECRET'];
  if (secret === undefined || secret === '') {
    throw new Error('WEB_HANDOFF_SECRET env var is required for web handoff');
  }
  return secret;
}

/**
 * Generate a signed JWT token for a web handoff step.
 */
export function generateWebHandoffToken(
  sessionId: string,
  nodeId: string,
  phoneNumber: string,
  pageType: string,
  ttlMinutes: number = TOKEN_TTL_MINUTES,
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const payload: Omit<WebHandoffTokenClaims, 'iat' | 'exp'> = {
    sessionId,
    nodeId,
    phoneNumber,
    pageType,
  };

  const options: SignOptions = { expiresIn: ttlMinutes * 60 };
  const token = jwt.sign(payload, getSecret(), options);

  return { token, expiresAt };
}

/**
 * Validate a web handoff token and return its claims.
 * Throws if the token is invalid, expired, or tampered with.
 */
export function validateWebHandoffToken(token: string): WebHandoffTokenClaims {
  return jwt.verify(token, getSecret()) as WebHandoffTokenClaims;
}

/**
 * Build the full magic link URL for the web handoff page.
 */
export function buildHandoffUrl(token: string): string {
  return `${CAVE_URL}/tribe/web/${token}`;
}

/**
 * Build the complete web handoff message — token, URL, expiry, and WA message text.
 */
export function buildHandoffLinkMessage(
  sessionId: string,
  nodeId: string,
  phoneNumber: string,
  pageType: string,
  messageText: string,
  ttlMinutes?: number,
): WebHandoffLinkMessage {
  const { token, expiresAt } = generateWebHandoffToken(
    sessionId,
    nodeId,
    phoneNumber,
    pageType,
    ttlMinutes,
  );
  const url = buildHandoffUrl(token);
  return { token, url, expiresAt, messageText };
}
