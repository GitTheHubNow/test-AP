// lib/ipSalt.ts
//
// Single source for the salt used when hashing client IPs (rate limiting,
// guest-book abuse tracking). There is deliberately NO hardcoded fallback in
// production: a salt that is visible in source lets anyone with the repo
// pre-compute a reverse lookup of the stored hashes. lib/env.ts refuses to
// boot in production without IP_HASH_SALT; this is the second line of defence.

export function getIpHashSalt(): string {
  const salt = process.env.IP_HASH_SALT;
  if (salt) return salt;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('IP_HASH_SALT is not set (required in production)');
  }
  return 'dev-only-ip-salt';
}
