import { validateEnv } from './env.validation';

const base = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts the minimum config and fills defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.ACCESS_TOKEN_TTL).toBe(900);
  });

  it('refuses to start with a short secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('refuses the same secret for access and refresh tokens', () => {
    expect(() => validateEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /must be different/,
    );
  });

  it('keeps object storage off unless all R2 settings are given', () => {
    expect(validateEnv(base).R2_BUCKET).toBeUndefined();
    const r2 = { R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'media' };
    expect(() => validateEnv({ ...base, ...r2 })).toThrow(/must be set together/);
    expect(() => validateEnv({ ...base, R2_BUCKET: 'media' })).toThrow(/must be set together/);
    expect(validateEnv({ ...base, ...r2, R2_ACCOUNT_ID: 'abc' }).R2_BUCKET).toBe('media');
  });

  it('refuses SameSite=None cookies without Secure', () => {
    expect(() =>
      validateEnv({ ...base, COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' }),
    ).toThrow(/requires COOKIE_SECURE/);
  });
});
