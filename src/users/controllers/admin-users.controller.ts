import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { OkResponseDto } from '../../auth/dto/auth-response.dto';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminRole, AdminUserEntity } from '../../database/entities';
import {
  AdminUserResponseDto,
  CreateAdminUserRequestDto,
  ResetPasswordRequestDto,
  UpdateAdminUserRequestDto,
} from '../dto/admin-user.dto';
import { AdminUsersService } from '../services/admin-users.service';

@ApiTags('Admin / Users')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @AppController({
    title: 'List admin users',
    roles: [AdminRole.ADMIN],
    response: [ApiOkResponse({ type: [AdminUserResponseDto] })],
  })
  async list(): Promise<AdminUserResponseDto[]> {
    return (await this.users.list()).map(AdminUserResponseDto.from);
  }

  @Post()
  @AppController({
    title: 'Create an admin user',
    roles: [AdminRole.ADMIN],
    response: [ApiCreatedResponse({ type: AdminUserResponseDto })],
  })
  async create(
    @Body() body: CreateAdminUserRequestDto,
    @CurrentUser() actor: AdminUserEntity,
  ): Promise<AdminUserResponseDto> {
    return AdminUserResponseDto.from(await this.users.create(body, actor));
  }

  @Patch(':id')
  @AppController({
    title: 'Rename, change role, or enable/disable an admin user',
    roles: [AdminRole.ADMIN],
    response: [ApiOkResponse({ type: AdminUserResponseDto })],
  })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAdminUserRequestDto,
    @CurrentUser() actor: AdminUserEntity,
  ): Promise<AdminUserResponseDto> {
    return AdminUserResponseDto.from(await this.users.update(id, body, actor));
  }

  @Post(':id/reset-password')
  @AppController({
    title: 'Set a new password for an admin user and sign them out everywhere',
    roles: [AdminRole.ADMIN],
    httpCode: HttpStatus.OK,
    response: [ApiOkResponse({ type: OkResponseDto })],
  })
  async resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResetPasswordRequestDto,
    @CurrentUser() actor: AdminUserEntity,
  ): Promise<OkResponseDto> {
    await this.users.resetPassword(id, body.password, actor);
    return { ok: true };
  }
}
