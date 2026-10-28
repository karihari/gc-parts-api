import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRole } from '../../database/entities';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

interface AppControllerOptions {
  title: string;
  httpCode?: HttpStatus;
  // Open to anyone; otherwise a signed-in admin is required.
  public?: boolean;
  // Restrict to these roles (implies a signed-in admin).
  roles?: AdminRole[];
  // Stricter per-route rate limit: `limit` requests per `ttl` milliseconds.
  throttle?: { limit: number; ttl: number };
  response?: MethodDecorator[];
}

// One decorator per endpoint for docs, auth, roles and rate limits, like LPMS @AppController.
export const AppController = (options: AppControllerOptions) => {
  const decorators: (MethodDecorator | ClassDecorator)[] = [
    ApiOperation({ summary: options.title }),
  ];

  if (options.public) {
    decorators.push(Public());
  } else {
    decorators.push(
      ApiCookieAuth('accessToken'),
      ApiUnauthorizedResponse({ description: 'Not signed in or session expired' }),
    );
  }

  if (options.roles?.length) {
    decorators.push(
      Roles(...options.roles),
      ApiForbiddenResponse({ description: 'Role not allowed' }),
    );
  }

  if (options.throttle) {
    decorators.push(
      Throttle({ default: options.throttle }),
      ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' }),
    );
  }

  if (options.httpCode) decorators.push(HttpCode(options.httpCode));

  return applyDecorators(...decorators, ...(options.response ?? []));
};
