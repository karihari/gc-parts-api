import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthCookieService } from './services/auth-cookie.service';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenService } from './services/token.service';

@Module({
  // Secrets are passed per sign/verify call, so access and refresh tokens use different keys.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    PasswordService,
    SessionService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [PasswordService, SessionService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
