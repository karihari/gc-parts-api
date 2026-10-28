import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { QueryFailedError } from 'typeorm';
import { COMMON_TOO_MANY_REQUESTS } from '../errors';

// Postgres error codes that are the client's fault rather than a server bug.
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

// Known HTTP errors pass through as they are; anything else becomes a generic 500
// so stack traces, SQL and driver messages never reach the client.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly exposeStack = false) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const request = host.switchToHttp().getRequest<FastifyRequest>();

    if (exception instanceof ThrottlerException) {
      reply.status(HttpStatus.TOO_MANY_REQUESTS).send({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: COMMON_TOO_MANY_REQUESTS,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: exception.getStatus(), message: body }
          : { ...(body as object) };
      if (this.exposeStack && exception.stack) Object.assign(payload, { stack: exception.stack });
      reply.status(exception.getStatus()).send(payload);
      return;
    }

    if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string } | undefined)?.code;
      if (code === PG_UNIQUE_VIOLATION || code === PG_CHECK_VIOLATION) {
        this.logger.warn(`Constraint violation ${code} on ${request.method} ${request.url}`);
        reply.status(HttpStatus.CONFLICT).send({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'CONSTRAINT_VIOLATION',
        });
        return;
      }
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      `Unhandled error on ${request.method} ${request.url} (req ${request.id})`,
      error.stack,
    );
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'INTERNAL_SERVER_ERROR',
      requestId: request.id,
    });
  }
}
