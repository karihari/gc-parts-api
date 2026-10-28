import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, IsNull, LessThan, Not, Repository } from 'typeorm';
import { timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { ClientInfo } from '../../common/decorators/client-info.decorator';
import { AuthSessionEntity, SessionRevokeReason } from '../../database/entities';
import { TokenService } from './token.service';

// How long the previous refresh token is still treated as a harmless race between tabs.
const ROTATION_GRACE_MS = 30_000;
// Revoked and expired sessions are kept this long for auditing, then deleted.
const RETENTION_DAYS = 30;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  session: AuthSessionEntity;
}

export type RotateResult =
  { status: 'rotated'; tokens: IssuedTokens } | { status: 'concurrent' } | { status: 'invalid' };

function sameHash(a: string, b: string | null): boolean {
  if (!b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly sessions: Repository<AuthSessionEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(userId: string, rememberMe: boolean, client: ClientInfo): Promise<IssuedTokens> {
    const ttl = rememberMe
      ? this.config.auth.refreshTokenRememberTtl
      : this.config.auth.refreshTokenTtl;
    // Absolute lifetime: refreshing never extends a session past this point.
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const session = await this.sessions.save(
      this.sessions.create({
        userId,
        rememberMe,
        expiresAt,
        // Replaced right below, once the session id exists to put in the token.
        refreshTokenHash: 'pending',
        userAgent: client.userAgent,
        ip: client.ip,
        lastUsedAt: new Date(),
      }),
    );

    const refreshToken = this.tokens.signRefreshToken(userId, session.id, expiresAt);
    session.refreshTokenHash = this.tokens.hashToken(refreshToken);
    await this.sessions.update(session.id, { refreshTokenHash: session.refreshTokenHash });

    return { accessToken: this.tokens.signAccessToken(userId, session.id), refreshToken, session };
  }

  // Swaps a refresh token for a new pair. The row is locked so two refreshes of one
  // session run one after the other instead of both reading the same hash.
  async rotate(
    sessionId: string,
    presentedToken: string,
    client: ClientInfo,
  ): Promise<RotateResult> {
    const presentedHash = this.tokens.hashToken(presentedToken);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AuthSessionEntity);
      const session = await repo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: sessionId })
        .getOne();

      if (!session || !session.isActive()) return { status: 'invalid' as const };

      if (!sameHash(presentedHash, session.refreshTokenHash)) {
        const recentlyRotated =
          session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
        if (recentlyRotated && sameHash(presentedHash, session.previousRefreshTokenHash)) {
          return { status: 'concurrent' as const };
        }
        // An old token came back after it was replaced: someone copied it. End the session
        // so neither the thief nor the real user can keep using it.
        this.logger.warn(
          `Refresh token reuse detected for session ${session.id} (user ${session.userId}) from ${client.ip}`,
        );
        await repo.update(session.id, {
          revokedAt: new Date(),
          revokedReason: SessionRevokeReason.REUSE_DETECTED,
        });
        return { status: 'invalid' as const };
      }

      const refreshToken = this.tokens.signRefreshToken(
        session.userId,
        session.id,
        session.expiresAt,
      );
      await repo.update(session.id, {
        previousRefreshTokenHash: session.refreshTokenHash,
        refreshTokenHash: this.tokens.hashToken(refreshToken),
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
        ip: client.ip,
        userAgent: client.userAgent,
      });

      return {
        status: 'rotated' as const,
        tokens: {
          accessToken: this.tokens.signAccessToken(session.userId, session.id),
          refreshToken,
          session,
        },
      };
    });
  }

  // Session plus its user, for authenticating a request. One query per admin request;
  // put a short cache in front of it if traffic ever needs it.
  findActiveWithUser(sessionId: string): Promise<AuthSessionEntity | null> {
    return this.sessions
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.user', 'u')
      .where('s.id = :sessionId', { sessionId })
      .andWhere('s.revokedAt IS NULL')
      .andWhere('s.expiresAt > now()')
      .getOne();
  }

  listActive(userId: string): Promise<AuthSessionEntity[]> {
    return this.sessions
      .createQueryBuilder('s')
      .where('s.userId = :userId', { userId })
      .andWhere('s.revokedAt IS NULL')
      .andWhere('s.expiresAt > now()')
      .orderBy('s.lastUsedAt', 'DESC', 'NULLS LAST')
      .getMany();
  }

  async revoke(sessionId: string, reason: SessionRevokeReason, userId?: string): Promise<boolean> {
    const result = await this.sessions.update(
      { id: sessionId, revokedAt: IsNull(), ...(userId ? { userId } : {}) },
      { revokedAt: new Date(), revokedReason: reason },
    );
    return (result.affected ?? 0) > 0;
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const result = await this.sessions.update(
      {
        userId,
        revokedAt: IsNull(),
        ...(exceptSessionId ? { id: Not(exceptSessionId) } : {}),
      },
      { revokedAt: new Date(), revokedReason: reason },
    );
    return result.affected ?? 0;
  }

  async touch(sessionId: string): Promise<void> {
    await this.sessions.update(sessionId, { lastUsedAt: new Date() });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async deleteOldSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.sessions.delete({ expiresAt: LessThan(cutoff) });
    const revoked = await this.sessions.delete({ revokedAt: LessThan(cutoff) });
    this.logger.log(
      `Deleted ${(expired.affected ?? 0) + (revoked.affected ?? 0)} old auth sessions`,
    );
  }
}
