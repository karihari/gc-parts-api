import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { Client, ClientInfo } from '../../common/decorators/client-info.decorator';
import { CurrentSession, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUserEntity, AuthSessionEntity, SessionRevokeReason } from '../../database/entities';
import { AuthUserResponseDto, OkResponseDto, SessionResponseDto } from '../dto/auth-response.dto';
import { ChangePasswordRequestDto } from '../dto/change-password-request.dto';
import { LoginRequestDto } from '../dto/login-request.dto';
import { AUTH_SESSION_NOT_FOUND } from '../errors';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post('login')
  @AppController({
    title: 'Sign in; sets httpOnly accessToken and refreshToken cookies',
    public: true,
    httpCode: HttpStatus.OK,
    // Per IP, on top of the per-account lockout.
    throttle: { limit: 5, ttl: 60_000 },
    response: [ApiOkResponse({ type: AuthUserResponseDto })],
  })
  async login(
    @Body() body: LoginRequestDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthUserResponseDto> {
    const { user, tokens } = await this.auth.login(body, client);
    this.cookies.setAuthCookies(reply, tokens);
    return AuthUserResponseDto.from(user);
  }

  @Post('refresh')
  @AppController({
    title: 'Swap the refresh cookie for new access and refresh cookies',
    public: true,
    httpCode: HttpStatus.OK,
    throttle: { limit: 30, ttl: 60_000 },
    response: [
      ApiOkResponse({ type: OkResponseDto }),
      ApiConflictResponse({ description: 'Another tab refreshed just now; retry the request' }),
    ],
  })
  async refresh(
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<OkResponseDto> {
    try {
      const tokens = await this.auth.refresh(this.cookies.readRefreshToken(req), client);
      this.cookies.setAuthCookies(reply, tokens);
      return { ok: true };
    } catch (error) {
      // A dead refresh token is useless; clear it so the client stops retrying.
      if ((error as { status?: number }).status === HttpStatus.UNAUTHORIZED) {
        this.cookies.clearAuthCookies(reply);
      }
      throw error;
    }
  }

  @Post('logout')
  @AppController({
    title: 'Sign out this device',
    public: true,
    httpCode: HttpStatus.OK,
    response: [ApiOkResponse({ type: OkResponseDto })],
  })
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<OkResponseDto> {
    await this.auth.logout(this.cookies.readAccessToken(req), this.cookies.readRefreshToken(req));
    this.cookies.clearAuthCookies(reply);
    return { ok: true };
  }

  @Post('logout-all')
  @AppController({
    title: 'Sign out every device, including this one',
    httpCode: HttpStatus.OK,
    response: [ApiOkResponse({ type: OkResponseDto })],
  })
  async logoutAll(
    @CurrentUser() user: AdminUserEntity,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<OkResponseDto> {
    await this.auth.logoutAll(user.id);
    this.cookies.clearAuthCookies(reply);
    return { ok: true };
  }

  @Get('me')
  @AppController({
    title: 'The signed-in admin',
    response: [ApiOkResponse({ type: AuthUserResponseDto })],
  })
  me(@CurrentUser() user: AdminUserEntity): AuthUserResponseDto {
    return AuthUserResponseDto.from(user);
  }

  @Post('change-password')
  @AppController({
    title: 'Change own password; signs out all other devices',
    httpCode: HttpStatus.OK,
    throttle: { limit: 5, ttl: 60_000 },
    response: [ApiOkResponse({ type: OkResponseDto })],
  })
  async changePassword(
    @CurrentUser() user: AdminUserEntity,
    @CurrentSession() session: AuthSessionEntity,
    @Body() body: ChangePasswordRequestDto,
  ): Promise<OkResponseDto> {
    await this.auth.changePassword(user, session, body);
    return { ok: true };
  }

  @Get('sessions')
  @AppController({
    title: 'Devices where this admin is signed in',
    response: [ApiOkResponse({ type: [SessionResponseDto] })],
  })
  async listSessions(
    @CurrentUser() user: AdminUserEntity,
    @CurrentSession() session: AuthSessionEntity,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.sessions.listActive(user.id);
    return sessions.map((s) => SessionResponseDto.from(s, session.id));
  }

  @Delete('sessions/:id')
  @AppController({
    title: 'Sign out one of own devices',
    response: [ApiOkResponse({ type: OkResponseDto })],
  })
  async revokeSession(
    @CurrentUser() user: AdminUserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OkResponseDto> {
    // Scoped by user id, so one admin cannot end another admin's session by guessing ids.
    const revoked = await this.sessions.revoke(id, SessionRevokeReason.LOGOUT, user.id);
    if (!revoked) throw new NotFoundException(AUTH_SESSION_NOT_FOUND);
    return { ok: true };
  }
}
