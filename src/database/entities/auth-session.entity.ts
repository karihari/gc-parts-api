import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity } from './base.entity';
import { SessionRevokeReason } from './enums';
import type { AdminUserEntity } from './admin-user.entity';

// One row per login. The access token carries the session id, so revoking the
// row logs that device out at once. Only a SHA-256 hash of the current refresh
// token is kept, so a database leak does not leak usable tokens.
@Entity('auth_sessions')
export class AuthSessionEntity extends UuidEntity {
  @Index('auth_sessions_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne('AdminUserEntity', 'sessions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: AdminUserEntity;

  @Column({ name: 'refresh_token_hash', type: 'text' })
  refreshTokenHash: string;

  // The token replaced by the last rotation. Seeing it again a few seconds later is two
  // browser tabs refreshing at once; seeing it later means it was stolen and replayed.
  @Column({ name: 'previous_refresh_token_hash', type: 'text', nullable: true })
  previousRefreshTokenHash: string | null;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ name: 'remember_me', type: 'boolean', default: false })
  rememberMe: boolean;

  @Index('auth_sessions_expires_at_idx')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({
    name: 'revoked_reason',
    type: 'enum',
    enum: SessionRevokeReason,
    enumName: 'session_revoke_reason',
    nullable: true,
  })
  revokedReason: SessionRevokeReason | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  isActive(now = new Date()): boolean {
    return !this.revokedAt && this.expiresAt > now;
  }
}
