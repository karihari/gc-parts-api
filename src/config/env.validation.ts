import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

export enum SameSite {
  LAX = 'lax',
  STRICT = 'strict',
  NONE = 'none',
}

const toBool = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : ['true', '1', 'yes'].includes(String(value).toLowerCase());
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

// Every variable the API reads. Validated once at startup so a missing or weak
// secret stops the process instead of failing on the first request.
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.DEVELOPMENT;

  @Transform(toInt)
  @IsInt()
  PORT = 4000;

  @IsString()
  HOST = '0.0.0.0';

  @IsString()
  API_PREFIX = 'api';

  @Transform(toBool)
  @IsBoolean()
  SWAGGER_ENABLED = false;

  // Set to true behind a reverse proxy / load balancer so req.ip is the client, not the proxy.
  @Transform(toBool)
  @IsBoolean()
  TRUST_PROXY = false;

  // Comma separated list of allowed browser origins, e.g. "https://gcparts.am,http://localhost:8080".
  @IsString()
  CORS_ORIGINS = 'http://localhost:8080';

  // Either DATABASE_URL (Neon / managed Postgres) or the POSTGRES_* parts.
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @Transform(toBool)
  @IsBoolean()
  DATABASE_SSL = false;

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  POSTGRES_HOST = 'localhost';

  @Transform(toInt)
  @IsInt()
  POSTGRES_PORT = 5432;

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  POSTGRES_USER = 'postgres';

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  POSTGRES_PASSWORD = 'postgres';

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  POSTGRES_DB = 'gc_parts';

  @Transform(toBool)
  @IsBoolean()
  TYPEORM_LOGGING = false;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET: string;

  // Seconds.
  @Transform(toInt)
  @IsInt()
  @Min(60)
  @Max(60 * 60)
  ACCESS_TOKEN_TTL = 15 * 60;

  @Transform(toInt)
  @IsInt()
  @Min(60 * 60)
  REFRESH_TOKEN_TTL = 24 * 60 * 60;

  @Transform(toInt)
  @IsInt()
  @Min(60 * 60)
  REFRESH_TOKEN_REMEMBER_TTL = 30 * 24 * 60 * 60;

  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  // Defaults to true in production (see buildConfig).
  @Transform(toBool)
  @IsOptional()
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  @IsEnum(SameSite)
  COOKIE_SAME_SITE: SameSite = SameSite.LAX;

  // Failed logins before an account is locked, and for how long (seconds).
  @Transform(toInt)
  @IsInt()
  @Min(3)
  LOGIN_MAX_ATTEMPTS = 5;

  @Transform(toInt)
  @IsInt()
  @Min(60)
  LOGIN_LOCK_SECONDS = 15 * 60;

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  MAKE_WEBHOOK_URL?: string;

  // Cloudflare R2 (S3 compatible) for uploaded files. Leave all unset to keep photos in
  // the database. Create the bucket and an "Object Read & Write" API token in the dashboard.
  @IsOptional()
  @IsString()
  R2_ACCOUNT_ID?: string;

  @IsOptional()
  @IsString()
  R2_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  R2_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  R2_BUCKET?: string;

  // Overrides https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com (tests, other S3 services).
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  R2_ENDPOINT?: string;

  // Public address of the bucket (custom domain or r2.dev). When set, GET /images/:id
  // redirects there so Cloudflare's CDN serves the bytes instead of this API.
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  R2_PUBLIC_URL?: string;
}

export function validateEnv(env: Record<string, unknown>): EnvironmentVariables {
  // "KEY=" in a .env file means "not set", not "set to an empty string".
  const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const config = plainToInstance(EnvironmentVariables, present, { exposeDefaultValues: true });
  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length) {
    const details = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }
  if (config.COOKIE_SAME_SITE === SameSite.NONE && config.COOKIE_SECURE === false) {
    throw new Error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }
  const r2 = [config.R2_ACCESS_KEY_ID, config.R2_SECRET_ACCESS_KEY, config.R2_BUCKET];
  const r2Partly =
    r2.some(Boolean) && !(r2.every(Boolean) && (config.R2_ACCOUNT_ID || config.R2_ENDPOINT));
  if (r2Partly) {
    throw new Error(
      'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_ACCOUNT_ID (or R2_ENDPOINT) must be set together',
    );
  }
  return config;
}
