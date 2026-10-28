import { EnvironmentVariables, NodeEnv, SameSite } from './env.validation';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface DatabaseConfig {
  url?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  logging: boolean;
}

export interface AuthConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  // Seconds.
  accessTokenTtl: number;
  refreshTokenTtl: number;
  refreshTokenRememberTtl: number;
  loginMaxAttempts: number;
  loginLockSeconds: number;
}

export interface CookieConfig {
  domain?: string;
  secure: boolean;
  sameSite: SameSite;
}

export interface AppConfig {
  env: NodeEnv;
  isProduction: boolean;
  port: number;
  host: string;
  apiPrefix: string;
  swaggerEnabled: boolean;
  trustProxy: boolean;
  corsOrigins: string[];
  database: DatabaseConfig;
  auth: AuthConfig;
  cookies: CookieConfig;
  makeWebhookUrl?: string;
}

export function buildConfig(env: EnvironmentVariables): AppConfig {
  const isProduction = env.NODE_ENV === NodeEnv.PRODUCTION;
  return {
    env: env.NODE_ENV,
    isProduction,
    port: env.PORT,
    host: env.HOST,
    apiPrefix: env.API_PREFIX,
    swaggerEnabled: env.SWAGGER_ENABLED,
    trustProxy: env.TRUST_PROXY,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    database: {
      url: env.DATABASE_URL,
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      username: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
      ssl: env.DATABASE_SSL,
      logging: env.TYPEORM_LOGGING,
    },
    auth: {
      accessTokenSecret: env.JWT_ACCESS_SECRET,
      refreshTokenSecret: env.JWT_REFRESH_SECRET,
      accessTokenTtl: env.ACCESS_TOKEN_TTL,
      refreshTokenTtl: env.REFRESH_TOKEN_TTL,
      refreshTokenRememberTtl: env.REFRESH_TOKEN_REMEMBER_TTL,
      loginMaxAttempts: env.LOGIN_MAX_ATTEMPTS,
      loginLockSeconds: env.LOGIN_LOCK_SECONDS,
    },
    cookies: {
      domain: env.COOKIE_DOMAIN,
      secure: env.COOKIE_SECURE ?? isProduction,
      sameSite: env.COOKIE_SAME_SITE,
    },
    makeWebhookUrl: env.MAKE_WEBHOOK_URL,
  };
}
