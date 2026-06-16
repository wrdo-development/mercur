/**
 * HMAC guard for WhatsApp webhook signature verification.
 * Verifies X-Hub-Signature-256 using WHATSAPP_APP_SECRET.
 * Uses timing-safe comparison to prevent timing attacks.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'sha256';
const PREFIX = 'sha256=';

export interface HmacGuardOptions {
  /** Raw request body (string or Buffer) for HMAC input */
  body: string | Buffer;
  /** Signature from X-Hub-Signature-256 header */
  signatureHeader: string | undefined;
  /** App secret from Meta (WHATSAPP_APP_SECRET) */
  secret: string | undefined;
}

/**
 * Verifies that the webhook request signature matches the computed HMAC of the body.
 * Uses timing-safe comparison.
 *
 * @param options - Body, signature header value, and app secret
 * @returns true if signature is valid
 */
export function verifyHmac(options: HmacGuardOptions): boolean {
  const { body, signatureHeader, secret } = options;

  if (secret === undefined || secret.length === 0) {
    return false;
  }

  if (signatureHeader === undefined || typeof signatureHeader !== 'string') {
    return false;
  }

  if (!signatureHeader.toLowerCase().startsWith(PREFIX)) {
    return false;
  }

  const receivedHex = signatureHeader.slice(PREFIX.length).trim();
  if (receivedHex.length !== 64) {
    return false;
  }

  const bodyBuffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  const expectedHmac = createHmac(ALGORITHM, secret).update(bodyBuffer).digest('hex');

  try {
    const receivedBuffer = Buffer.from(receivedHex, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');
    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
