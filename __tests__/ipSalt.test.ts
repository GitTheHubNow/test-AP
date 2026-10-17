import { describe, it, expect, afterEach } from 'vitest';
import { getIpHashSalt } from '@/lib/ipSalt';

const env = process.env as Record<string, string | undefined>;
const saved = { salt: env.IP_HASH_SALT, node: env.NODE_ENV };
afterEach(() => { env.IP_HASH_SALT = saved.salt; env.NODE_ENV = saved.node; });

describe('getIpHashSalt', () => {
  it('uses the configured salt', () => {
    env.IP_HASH_SALT = 'abc123';
    expect(getIpHashSalt()).toBe('abc123');
  });
  it('has no source-visible fallback in production', () => {
    delete env.IP_HASH_SALT; env.NODE_ENV = 'production';
    expect(() => getIpHashSalt()).toThrow(/IP_HASH_SALT/);
  });
  it('falls back only outside production', () => {
    delete env.IP_HASH_SALT; env.NODE_ENV = 'development';
    expect(getIpHashSalt()).toBeTruthy();
  });
});
