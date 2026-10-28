import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordService } from '../../auth/services/password.service';
import { SessionService } from '../../auth/services/session.service';
import { AdminUserEntity, SessionRevokeReason } from '../../database/entities';
import { CreateAdminUserRequestDto, UpdateAdminUserRequestDto } from '../dto/admin-user.dto';
import { USER_CANNOT_CHANGE_SELF, USER_EMAIL_TAKEN, USER_NOT_FOUND } from '../errors';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(AdminUserEntity)
    private readonly users: Repository<AdminUserEntity>,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  list(): Promise<AdminUserEntity[]> {
    return this.users.find({ order: { createdAt: 'ASC' } });
  }

  async create(dto: CreateAdminUserRequestDto, actor: AdminUserEntity): Promise<AdminUserEntity> {
    if (await this.users.existsBy({ email: dto.email })) {
      throw new ConflictException(USER_EMAIL_TAKEN);
    }
    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash: await this.passwords.hash(dto.password),
        passwordChangedAt: new Date(),
      }),
    );
    this.logger.log(`User ${actor.id} created admin user ${user.id} (${user.role})`);
    return this.getById(user.id);
  }

  async update(
    id: string,
    dto: UpdateAdminUserRequestDto,
    actor: AdminUserEntity,
  ): Promise<AdminUserEntity> {
    const user = await this.getById(id);
    if (
      user.id === actor.id &&
      ((dto.role !== undefined && dto.role !== user.role) || dto.isActive === false)
    ) {
      throw new BadRequestException(USER_CANNOT_CHANGE_SELF);
    }

    await this.users.update(id, dto);
    if (dto.isActive === false && user.isActive) {
      await this.sessions.revokeAllForUser(id, SessionRevokeReason.USER_DISABLED);
    }
    this.logger.log(`User ${actor.id} updated admin user ${id}: ${JSON.stringify(dto)}`);
    return this.getById(id);
  }

  // For an admin who forgot their password. Also clears a lockout and signs them out everywhere.
  async resetPassword(id: string, password: string, actor: AdminUserEntity): Promise<void> {
    await this.getById(id);
    await this.users.update(id, {
      passwordHash: await this.passwords.hash(password),
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    await this.sessions.revokeAllForUser(id, SessionRevokeReason.PASSWORD_CHANGED);
    this.logger.log(`User ${actor.id} reset the password of admin user ${id}`);
  }

  private async getById(id: string): Promise<AdminUserEntity> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException(USER_NOT_FOUND);
    return user;
  }
}
