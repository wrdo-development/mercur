import { readUserCookie, signUserCookie } from '../spine.helpers';

const SECRET = 'cookie-test-secret';

describe('spine cookie helpers', () => {
  it('roundtrips: signUserCookie → readUserCookie returns the user id', () => {
    const cookie = signUserCookie('usr_01ABC', SECRET);
    expect(readUserCookie(cookie, SECRET)).toBe('usr_01ABC');
  });

  it('preserves user ids (ids use underscores, no dots in payload)', () => {
    const cookie = signUserCookie('wrdo_user_12345', SECRET);
    expect(readUserCookie(cookie, SECRET)).toBe('wrdo_user_12345');
  });

  it('rejects a tampered cookie value', () => {
    const cookie = signUserCookie('usr_01ABC', SECRET);
    const tampered = `usr_EVIL.${cookie.split('.').slice(1).join('.')}`;
    expect(readUserCookie(tampered, SECRET)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const cookie = signUserCookie('usr_01ABC', SECRET);
    const tampered = `${cookie.slice(0, -2)}xx`;
    expect(readUserCookie(tampered, SECRET)).toBeNull();
  });

  it('rejects a cookie signed with a different secret', () => {
    const cookie = signUserCookie('usr_01ABC', 'other-secret');
    expect(readUserCookie(cookie, SECRET)).toBeNull();
  });

  it('returns null for a missing cookie', () => {
    expect(readUserCookie(undefined, SECRET)).toBeNull();
    expect(readUserCookie(null, SECRET)).toBeNull();
    expect(readUserCookie('', SECRET)).toBeNull();
  });

  it('returns null for a malformed (no signature) cookie', () => {
    expect(readUserCookie('usr_01ABC', SECRET)).toBeNull();
    expect(readUserCookie('.sig', SECRET)).toBeNull();
    expect(readUserCookie('usr_01ABC.', SECRET)).toBeNull();
  });
});
