import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

// req.ip honours TRUST_PROXY, so it is the real client address behind a load balancer.
export const Client = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientInfo => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  const userAgent = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: userAgent ? userAgent.slice(0, 300) : null };
});
