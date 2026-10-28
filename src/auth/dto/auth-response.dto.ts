import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminRole, AdminUserEntity, AuthSessionEntity } from '../../database/entities';

export class AuthUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: AdminRole })
  role: AdminRole;

  @ApiPropertyOptional({ type: 'string', format: 'date-time', nullable: true })
  lastLoginAt: Date | null;

  static from(user: AdminUserEntity): AuthUserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
    };
  }
}

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  current: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  userAgent: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  ip: string | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ type: 'string', format: 'date-time', nullable: true })
  lastUsedAt: Date | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  expiresAt: Date;

  static from(session: AuthSessionEntity, currentId?: string): SessionResponseDto {
    return {
      id: session.id,
      current: session.id === currentId,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
    };
  }
}

export class OkResponseDto {
  @ApiProperty({ example: true })
  ok: true;
}
