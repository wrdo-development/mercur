import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TTL_MS = 5 * 60 * 1000;

export interface WebTokenKv {
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export interface WebTokenServiceOptions {
  kv: WebTokenKv;
  secret: string;
  nowMs?: () => number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createWebTokenService(options: WebTokenServiceOptions) {
  const now = options.nowMs ?? (() => Date.now());
  const { kv, secret } = options;

  return {
    /** Mint a single-use token for a user; stored in KV under its nonce. */
    async mint(userId: string): Promise<string> {
      const nonce = randomUUID();
      const exp = now() + TTL_MS;
      const payload = `${userId}.${nonce}.${exp}`;
      const sig = sign(payload, secret);
      await kv.set(`web_token:${nonce}`, '1', 'PX', String(TTL_MS));
      return `${Buffer.from(payload).toString('base64url')}.${sig}`;
    },

    /** Verify signature + expiry + single-use; returns userId or null. Burns the nonce. */
    async verifyAndBurn(token: string): Promise<string | null> {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [payloadB64, sig] = parts;
      let payload: string;
      try {
        payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
      } catch {
        return null;
      }
      if (!safeEqual(sign(payload, secret), sig)) return null;
      const [userId, nonce, expStr] = payload.split('.');
      if (!userId || !nonce || !expStr) return null;
      if (now() > Number(expStr)) return null;
      const burned = await kv.del(`web_token:${nonce}`);
      if (burned === 0 || burned === null) return null;
      return userId;
    },
  };
}

export type WebTokenService = ReturnType<typeof createWebTokenService>;
