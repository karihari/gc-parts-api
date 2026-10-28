import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { ClientInfo } from '../../common/decorators/client-info.decorator';
import { AdminUserEntity, AuthSessionEntity, SessionRevokeReason } from '../../database/entities';
import { ChangePasswordRequestDto } from '../dto/change-password-request.dto';
import { LoginRequestDto } from '../dto/login-request.dto';
import {
  AUTH_INVALID_CREDENTIALS,
  AUTH_NEW_PASSWORD_SAME_AS_OLD,
  AUTH_REFRESH_CONCURRENT,
  AUTH_REFRESH_TOKEN_INVALID,
  AUTH_USER_DISABLED,
  AUTH_WRONG_CURRENT_PASSWORD,
} from '../errors';
import { PasswordService } from './password.service';
import { IssuedTokens, SessionService } from './session.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(AdminUserEntity)
    private readonly users: Repository<AdminUserEntity>,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(
    { email, password, rememberMe = false }: LoginRequestDto,
    client: ClientInfo,
  ): Promise<{ user: AdminUserEntity; tokens: IssuedTokens }> {
    const user = await this.findUserWithSecrets(email);

    // Unknown email, wrong password and locked account all get the same answer,
    // so the endpoint cannot be used to discover which admin emails exist.
    if (!user) {
      await this.passwords.verifyDummy(password);
      this.logger.warn(`Failed login for unknown email from ${client.ip}`);
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.passwords.verifyDummy(password);
      this.logger.warn(`Login attempt on locked account ${user.id} from ${client.ip}`);
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS);
    }

    if (!(await this.passwords.verify(password, user.passwordHash))) {
      await this.recordFailedLogin(user.id);
      this.logger.warn(`Failed login for user ${user.id} from ${client.ip}`);
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS);
    }

    // Only someone who knows the password learns that the account is disabled.
    if (!user.isActive) throw new UnauthorizedException(AUTH_USER_DISABLED);

    const update: Partial<AdminUserEntity> = {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    };
    if (this.passwords.needsRehash(user.passwordHash)) {
      update.passwordHash = await this.passwords.hash(password);
    }
    await this.users.update(user.id, update);

    const tokens = await this.sessions.create(user.id, rememberMe, client);
    this.logger.log(`User ${user.id} signed in (session ${tokens.session.id})`);
    return { user: { ...user, ...update } as AdminUserEntity, tokens };
  }

  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException(AUTH_REFRESH_TOKEN_INVALID);

    const verified = this.tokens.verifyRefreshToken(refreshToken);
    if (!verified.ok) throw new UnauthorizedException(AUTH_REFRESH_TOKEN_INVALID);

    const result = await this.sessions.rotate(verified.payload.sid, refreshToken, client);
    if (result.status === 'concurrent') throw new ConflictException(AUTH_REFRESH_CONCURRENT);
    if (result.status === 'invalid') throw new UnauthorizedException(AUTH_REFRESH_TOKEN_INVALID);

    const user = await this.users.findOneBy({ id: verified.payload.sub });
    if (!user?.isActive) {
      await this.sessions.revoke(verified.payload.sid, SessionRevokeReason.USER_DISABLED);
      throw new UnauthorizedException(AUTH_USER_DISABLED);
    }
    return result.tokens;
  }

  // Works with an expired access token: the refresh cookie identifies the session.
  async logout(accessToken: string | undefined, refreshToken: string | undefined): Promise<void> {
    const sessionId =
      (refreshToken && this.sessionIdFrom(this.tokens.verifyRefreshToken(refreshToken))) ||
      (accessToken && this.sessionIdFrom(this.tokens.verifyAccessToken(accessToken)));
    if (sessionId) await this.sessions.revoke(sessionId, SessionRevokeReason.LOGOUT);
  }

  async logoutAll(userId: string): Promise<number> {
    return this.sessions.revokeAllForUser(userId, SessionRevokeReason.LOGOUT_ALL);
  }

  async changePassword(
    user: AdminUserEntity,
    session: AuthSessionEntity,
    { currentPassword, newPassword }: ChangePasswordRequestDto,
  ): Promise<void> {
    const withSecrets = await this.findUserWithSecrets(user.email);
    if (!withSecrets || !(await this.passwords.verify(currentPassword, withSecrets.passwordHash))) {
      throw new BadRequestException(AUTH_WRONG_CURRENT_PASSWORD);
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(AUTH_NEW_PASSWORD_SAME_AS_OLD);
    }

    await this.users.update(user.id, {
      passwordHash: await this.passwords.hash(newPassword),
      passwordChangedAt: new Date(),
    });
    // Any other device that had this account open is signed out.
    const revoked = await this.sessions.revokeAllForUser(
      user.id,
      SessionRevokeReason.PASSWORD_CHANGED,
      session.id,
    );
    this.logger.log(`User ${user.id} changed password; ${revoked} other sessions revoked`);
  }

  private findUserWithSecrets(email: string): Promise<AdminUserEntity | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.failedLoginAttempts', 'u.lockedUntil'])
      .where('u.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  // One atomic UPDATE, so parallel guesses cannot slip past the attempt limit.
  private async recordFailedLogin(userId: string): Promise<void> {
    const { loginMaxAttempts, loginLockSeconds } = this.config.auth;
    await this.users
      .createQueryBuilder()
      .update(AdminUserEntity)
      .set({
        failedLoginAttempts: () => 'failed_login_attempts + 1',
        lockedUntil: () =>
          `CASE WHEN failed_login_attempts + 1 >= :max
                THEN now() + make_interval(secs => :lockSeconds)
                ELSE locked_until END`,
      })
      .where('id = :userId', { userId })
      .setParameters({ max: loginMaxAttempts, lockSeconds: loginLockSeconds })
      .execute();
  }

  private sessionIdFrom(result: ReturnType<TokenService['verifyAccessToken']>): string | undefined {
    return result.ok ? result.payload.sid : undefined;
  }
}
