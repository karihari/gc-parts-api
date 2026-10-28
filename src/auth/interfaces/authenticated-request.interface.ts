import { FastifyRequest } from 'fastify';
import { AdminUserEntity, AuthSessionEntity } from '../../database/entities';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: AdminUserEntity;
  session?: AuthSessionEntity;
}
