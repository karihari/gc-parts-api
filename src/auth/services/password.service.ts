import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCb, ScryptOptions, timingSafeEqual } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

// scrypt is memory-hard, so offline guessing on GPUs is expensive. The parameters are
// stored in every hash ("scrypt$N$r$p$salt$hash"), so they can be raised later and old
// hashes upgraded on the next successful login (see needsRehash).
// LPMS uses a single HMAC-SHA256 with a salt, which is fast to brute force; this replaces it.
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 128 * PARAMS.N * PARAMS.r * 2;

@Injectable()
export class PasswordService {
  // Verifying against this when the email is unknown keeps the response time the same,
  // so timing does not reveal which emails have an account.
  private dummyHash?: Promise<string>;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEMORY });
    return [
      'scrypt',
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, keyB64] = parts;
    const N = Number(n);
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N,
      r: Number(r),
      p: Number(p),
      maxmem: 128 * N * Number(r) * 2,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  }

  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(password, await this.dummyHash);
    return false;
  }

  needsRehash(stored: string): boolean {
    const [, n, r, p] = stored.split('$');
    return Number(n) !== PARAMS.N || Number(r) !== PARAMS.r || Number(p) !== PARAMS.p;
  }
}
