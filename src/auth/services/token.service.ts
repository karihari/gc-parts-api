import { Inject, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { TokenPayload, TokenType } from '../interfaces/token-payload.interface';

const ISSUER = 'gc-parts-api';
const AUDIENCE = 'gc-parts-admin';

export type VerifyResult =
  { ok: true; payload: TokenPayload } | { ok: false; reason: 'expired' | 'invalid' };

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  signAccessToken(userId: string, sessionId: string): string {
    return this.jwt.sign({ sub: userId, sid: sessionId, typ: 'access' } satisfies TokenPayload, {
      secret: this.config.auth.accessTokenSecret,
      expiresIn: this.config.auth.accessTokenTtl,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    });
  }

  signRefreshToken(userId: string, sessionId: string, expiresAt: Date): string {
    const expiresIn = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return this.jwt.sign(
      { sub: userId, sid: sessionId, typ: 'refresh', jti: randomUUID() } satisfies TokenPayload,
      {
        secret: this.config.auth.refreshTokenSecret,
        expiresIn,
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithm: 'HS256',
      },
    );
  }

  verifyAccessToken(token: string): VerifyResult {
    return this.verify(token, 'access', this.config.auth.accessTokenSecret);
  }

  verifyRefreshToken(token: string): VerifyResult {
    return this.verify(token, 'refresh', this.config.auth.refreshTokenSecret);
  }

  // Only this hash is stored, never the token itself.
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private verify(token: string, type: TokenType, secret: string): VerifyResult {
    try {
      const payload = this.jwt.verify<TokenPayload>(token, {
        secret,
        issuer: ISSUER,
        audience: AUDIENCE,
        // Pinning the algorithm blocks "alg: none" and algorithm-confusion tokens.
        algorithms: ['HS256'],
      });
      // An access token must never be accepted as a refresh token or the other way round.
      if (payload.typ !== type || !payload.sub || !payload.sid) {
        return { ok: false, reason: 'invalid' };
      }
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, reason: error instanceof TokenExpiredError ? 'expired' : 'invalid' };
    }
  }
}
