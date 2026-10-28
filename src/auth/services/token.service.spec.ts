import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config';
import { TokenService } from './token.service';

const config = {
  auth: {
    accessTokenSecret: 'a'.repeat(40),
    refreshTokenSecret: 'r'.repeat(40),
    accessTokenTtl: 900,
  },
} as AppConfig;

describe('TokenService', () => {
  const jwt = new JwtService({});
  const service = new TokenService(jwt, config);

  it('round-trips an access token', () => {
    const result = service.verifyAccessToken(service.signAccessToken('user-1', 'session-1'));
    expect(result).toEqual({
      ok: true,
      payload: expect.objectContaining({ sub: 'user-1', sid: 'session-1', typ: 'access' }),
    });
  });

  it('never accepts a refresh token as an access token, or the reverse', () => {
    const refresh = service.signRefreshToken('u', 's', new Date(Date.now() + 60_000));
    const access = service.signAccessToken('u', 's');
    expect(service.verifyAccessToken(refresh).ok).toBe(false);
    expect(service.verifyRefreshToken(access).ok).toBe(false);
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign(
      { sub: 'u', sid: 's', typ: 'access' },
      { secret: 'x'.repeat(40), issuer: 'gc-parts-api', audience: 'gc-parts-admin' },
    );
    expect(service.verifyAccessToken(forged)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an unsigned "alg: none" token', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: 'u',
      sid: 's',
      typ: 'access',
      iss: 'gc-parts-api',
      aud: 'gc-parts-admin',
    })}.`;
    expect(service.verifyAccessToken(none).ok).toBe(false);
  });

  it('reports expiry separately so the client knows to refresh', () => {
    const expired = jwt.sign(
      { sub: 'u', sid: 's', typ: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
      { secret: config.auth.accessTokenSecret, issuer: 'gc-parts-api', audience: 'gc-parts-admin' },
    );
    expect(service.verifyAccessToken(expired)).toEqual({ ok: false, reason: 'expired' });
  });

  it('gives two refresh tokens of one session different hashes', () => {
    const expires = new Date(Date.now() + 60_000);
    const a = service.signRefreshToken('u', 's', expires);
    const b = service.signRefreshToken('u', 's', expires);
    expect(service.hashToken(a)).not.toEqual(service.hashToken(b));
  });
});
