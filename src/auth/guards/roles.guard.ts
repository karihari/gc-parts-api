import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../database/entities';
import { AUTH_FORBIDDEN_ROLE } from '../errors';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

// Runs after JwtAuthGuard. The role is read from the database row loaded for this
// request, not from the token, so a role change applies on the very next request.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user && roles.includes(user.role)) return true;
    throw new ForbiddenException(AUTH_FORBIDDEN_ROLE);
  }
}
