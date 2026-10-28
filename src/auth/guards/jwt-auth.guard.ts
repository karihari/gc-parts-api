import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AUTH_ACCESS_TOKEN_EXPIRED, AUTH_SESSION_REVOKED, AUTH_UNAUTHORIZED } from '../errors';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AuthCookieService } from '../services/auth-cookie.service';
import { SessionService } from '../services/session.service';
import { TokenService } from '../services/token.service';

// Registered globally: a route is protected unless it is marked @Public().
// Forgetting a decorator therefore closes an endpoint instead of opening it
// (LPMS does the opposite: routes are open unless they opt in to AuthGuard).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly cookies: AuthCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.cookies.readAccessToken(req);
    if (!token) throw new UnauthorizedException(AUTH_UNAUTHORIZED);

    const verified = this.tokens.verifyAccessToken(token);
    if (!verified.ok) {
      throw new UnauthorizedException(
        verified.reason === 'expired' ? AUTH_ACCESS_TOKEN_EXPIRED : AUTH_UNAUTHORIZED,
      );
    }

    // The signature alone is not trusted: the session must still exist and be live,
    // which is what makes logout, "sign out everywhere" and disabling a user instant.
    const session = await this.sessions.findActiveWithUser(verified.payload.sid);
    if (!session?.user || session.userId !== verified.payload.sub || !session.user.isActive) {
      throw new UnauthorizedException(AUTH_SESSION_REVOKED);
    }

    req.user = session.user;
    req.session = session;
    return true;
  }
}
