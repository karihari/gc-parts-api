import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { UuidEntity } from './base.entity';
import { AdminRole } from './enums';
import type { AuthSessionEntity } from './auth-session.entity';

@Entity('admin_users')
export class AdminUserEntity extends UuidEntity {
  // Always stored lower-cased.
  @ApiProperty()
  @Column({ type: 'text', unique: true })
  email: string;

  @ApiProperty()
  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @ApiProperty({ enum: AdminRole })
  @Column({ type: 'enum', enum: AdminRole, enumName: 'admin_role', default: AdminRole.STAFF })
  role: AdminRole;

  @ApiProperty()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'failed_login_attempts', type: 'integer', default: 0, select: false })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true, select: false })
  lockedUntil: Date | null;

  @ApiPropertyOptional({ type: 'string', format: 'date-time', nullable: true })
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true, select: false })
  passwordChangedAt: Date | null;

  @OneToMany('AuthSessionEntity', 'user')
  sessions?: AuthSessionEntity[];
}
