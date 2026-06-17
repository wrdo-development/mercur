/**
 * Unit tests for the web-handoff mint capability (WRDO-180, Task 9, Part B).
 *
 * The mint produces a single-use `t` that the existing web-token verifyAndBurn
 * accepts (roundtrip), and the factory fails fast when SPINE_TOKEN_SECRET is
 * unset (a strong secret is the entire token-forgery defense).
 */

import { createWebTokenService } from '../../tribe-messages';
import { createWebHandoffMinter } from '../web-handoff-mint';

const REAL_SECRET = process.env['SPINE_TOKEN_SECRET'];

function fakeKv(): {
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  _store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    _store: store,
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async del(key) {
      const had = store.delete(key);
      return had ? 1 : 0;
    },
  };
}

describe('web-handoff mint (WRDO-180, Task 9)', () => {
  afterEach(() => {
    if (REAL_SECRET === undefined) {
      delete process.env['SPINE_TOKEN_SECRET'];
    } else {
      process.env['SPINE_TOKEN_SECRET'] = REAL_SECRET;
    }
  });

  it('mints a token the web-token service verifies back to the user id', async () => {
    process.env['SPINE_TOKEN_SECRET'] = 'unit-test-spine-secret';
    const kv = fakeKv();
    const mint = createWebHandoffMinter({ kv });

    const token = await mint('usr_handoff_1');

    // Roundtrip through the SAME service the exchange route uses.
    const verifier = createWebTokenService({ kv, secret: 'unit-test-spine-secret' });
    await expect(verifier.verifyAndBurn(token)).resolves.toBe('usr_handoff_1');
  });

  it('throws when SPINE_TOKEN_SECRET is unset', () => {
    delete process.env['SPINE_TOKEN_SECRET'];
    expect(() => createWebHandoffMinter({ kv: fakeKv() })).toThrow(/SPINE_TOKEN_SECRET/);
  });
});
