import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { COMMON_ORIGIN_NOT_ALLOWED } from '../errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defence for cookie auth. Browsers always send Origin on cross-site writes,
// so a write coming from a page that is not ours is refused before it runs.
// CORS alone is not enough: it hides the response but the request still executes.
// Requests without Origin (curl, server-to-server) carry no victim's cookies by accident.
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowed = new Set(config.corsOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    if (!origin) return true;
    if (this.allowed.has(origin)) return true;

    throw new ForbiddenException(COMMON_ORIGIN_NOT_ALLOWED);
  }
}
