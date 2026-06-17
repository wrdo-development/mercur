import { createWebTokenService, type WebTokenKv } from '../web-token';

function fakeKv(): WebTokenKv & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async set(key, value, ..._args) { store.set(key, value); return 'OK'; },
    async get(key) { return store.get(key) ?? null; },
    async del(key) { const had = store.delete(key); return had ? 1 : 0; },
  };
}

const SECRET = 'test-secret';

describe('web-token', () => {
  it('mints a token that verifies back to the user id', async () => {
    let t = 1_000_000;
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => t });
    const token = await svc.mint('user_1');
    const userId = await svc.verifyAndBurn(token);
    expect(userId).toBe('user_1');
  });

  it('is single-use — a second verify fails', async () => {
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => 1_000_000 });
    const token = await svc.mint('user_1');
    await svc.verifyAndBurn(token);
    await expect(svc.verifyAndBurn(token)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    let t = 1_000_000;
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => t });
    const token = await svc.mint('user_1');
    t += 6 * 60 * 1000;
    await expect(svc.verifyAndBurn(token)).resolves.toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => 1_000_000 });
    const token = await svc.mint('user_1');
    const tampered = `${token.slice(0, -2)}xx`;
    await expect(svc.verifyAndBurn(tampered)).resolves.toBeNull();
  });
});
