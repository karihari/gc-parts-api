// Cloudflare Worker in front of the NestJS API container.
// Every request is forwarded to one container instance that runs the Dockerfile in the repo root.
import { Container, getContainer } from '@cloudflare/containers';

// Variables (wrangler.jsonc "vars") and secrets (dashboard / `wrangler secret put`)
// that are handed to the Node process inside the container.
const PASSTHROUGH = [
  'NODE_ENV',
  'API_PREFIX',
  'SWAGGER_ENABLED',
  'CORS_ORIGINS',
  'DATABASE_URL',
  'DATABASE_SSL',
  'TYPEORM_LOGGING',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL',
  'REFRESH_TOKEN_REMEMBER_TTL',
  'COOKIE_SAME_SITE',
  'COOKIE_SECURE',
  'COOKIE_DOMAIN',
  'LOGIN_MAX_ATTEMPTS',
  'LOGIN_LOCK_SECONDS',
  'MAKE_WEBHOOK_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_PUBLIC_URL',
  'RUN_MIGRATIONS',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
  'SEED_ADMIN_NAME',
  'SEED_SKIP_PRODUCTS',
];

export class ApiContainer extends Container {
  defaultPort = 4000;
  // Stop the container after 30 minutes without requests; the next request starts it again.
  sleepAfter = '30m';
  enableInternet = true;

  constructor(ctx, env) {
    super(ctx, env);
    const vars = { PORT: '4000', HOST: '0.0.0.0', TRUST_PROXY: 'true' };
    for (const key of PASSTHROUGH) {
      if (env[key] !== undefined && env[key] !== '') vars[key] = String(env[key]);
    }
    this.envVars = vars;
  }

  onError(error) {
    console.error('API container error', error);
    throw error;
  }
}

export default {
  async fetch(request, env) {
    // The container only sees the Worker as its client, so pass the real visitor IP
    // (used for rate limits). Overwrite rather than append so it cannot be spoofed.
    const headers = new Headers(request.headers);
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) headers.set('x-forwarded-for', ip);
    headers.set('x-forwarded-proto', 'https');
    const forwarded = new Request(request, { headers });
    return getContainer(env.API).fetch(forwarded);
  },
};
