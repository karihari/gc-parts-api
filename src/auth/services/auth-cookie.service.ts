import { Inject, Injectable } from '@nestjs/common';
import { CookieSerializeOptions } from '@fastify/cookie';
import { FastifyReply, FastifyRequest } from 'fastify';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AuthSessionEntity } from '../../database/entities';

export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';

// Tokens live only in httpOnly cookies, so page scripts (and any XSS) cannot read them.
// The refresh cookie is scoped to the auth routes, so it is not sent with every request.
@Injectable()
export class AuthCookieService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private get refreshPath(): string {
    return `/${this.config.apiPrefix}/auth`;
  }

  private base(path: string): CookieSerializeOptions {
    return {
      httpOnly: true,
      secure: this.config.cookies.secure,
      sameSite: this.config.cookies.sameSite,
      domain: this.config.cookies.domain,
      path,
    };
  }

  setAuthCookies(
    reply: FastifyReply,
    tokens: { accessToken: string; refreshToken: string; session: AuthSessionEntity },
  ): void {
    reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.base('/'),
      maxAge: this.config.auth.accessTokenTtl,
    });

    const refreshOptions = this.base(this.refreshPath);
    // Without "remember me" the refresh cookie ends when the browser closes.
    if (tokens.session.rememberMe) {
      refreshOptions.maxAge = Math.floor((tokens.session.expiresAt.getTime() - Date.now()) / 1000);
    }
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, refreshOptions);
  }

  clearAuthCookies(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_COOKIE, this.base('/'));
    reply.clearCookie(REFRESH_COOKIE, this.base(this.refreshPath));
  }

  // Cookie first; a Bearer header is also accepted for API clients such as Postman.
  readAccessToken(req: FastifyRequest): string | undefined {
    const fromCookie = req.cookies?.[ACCESS_COOKIE];
    if (fromCookie) return fromCookie;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;
    return undefined;
  }

  readRefreshToken(req: FastifyRequest): string | undefined {
    return req.cookies?.[REFRESH_COOKIE] || undefined;
  }
}
