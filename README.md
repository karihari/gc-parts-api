# Grand Cherokee Parts Hub — API

NestJS 11 (Fastify) + TypeORM + PostgreSQL backend for the Grand Cherokee Parts Hub shop.
It replaces the TanStack server functions in `grand-cherokee-parts-hub/src/lib/*.functions.ts`
and the single shared admin password with real admin accounts.

Patterns follow the LPMS API (Fastify adapter, `@AppController` decorator, controller → service →
repository layers, DB-backed sessions with access + refresh JWTs in httpOnly cookies, error-code
messages, global validation and exception filters). Where LPMS has a weak spot, this project uses
a stronger option; see [Security](#security).

## Quick start

```bash
cp .env.example .env            # fill JWT_ACCESS_SECRET / JWT_REFRESH_SECRET and DB settings
npm install
npm run migration:run           # safe on an empty DB and on the existing Drizzle/Neon DB
SEED_ADMIN_EMAIL=you@shop.am SEED_ADMIN_PASSWORD='a-long-password' npm run seed
npm run start:dev               # http://localhost:4000/api, Swagger at /api/docs if SWAGGER_ENABLED=true
```

### Local development with the shop frontend (no Docker)

```bash
# terminal 1 — Postgres on :5433, data kept in .pg-local
npm run db:local
# terminal 2 — .env with POSTGRES_PORT=5433 and CORS_ORIGINS=http://localhost:8080
npm run migration:run && npm run seed && npm run start:dev
# terminal 3 — the shop (VITE_API_URL defaults to http://localhost:4000/api)
cd ../grand-cherokee-parts-hub && npx bun@1 install && npx vite dev   # http://localhost:8080
```

Admin panel: http://localhost:8080/admin (sign in with the seeded admin).

Tests:

```bash
npm test             # unit tests
npm run test:e2e     # starts a throwaway real Postgres (embedded-postgres), no Docker needed
```

## Layout

```
src/
  config/          env validation (fails at startup on missing/weak secrets), typed APP_CONFIG token
  database/        entities, idempotent migration, TypeORM options, CLI data source, seed
  common/          @AppController, @Public, @Roles, @CurrentUser, OriginGuard, exception filter, pagination
  auth/            login, refresh, logout, sessions, password change; guards; scrypt; JWT
  users/           admin user management (ADMIN role only)
  products/        public catalog + search/fitment filters; admin CRUD
  images/          admin photo upload (multipart, magic-byte check); public serving
  orders/          pickup checkout (transactional stock); customer status lookup; admin workflow
  enquiries/       contact form → Make.com webhook
  notifications/   Make.com webhook client with timeout
  health/          GET /api/health
```

## Endpoints

All paths are under `/api`. Everything requires a signed-in admin unless marked public.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | DB check |
| GET | `/catalog` | public | categories + generations |
| GET | `/products` | public | `q, category, gen, year, engine, featured, inStock, sort, page, perPage` |
| GET | `/products/:slug` | public | |
| GET | `/images/:id` | public | immutable cache |
| POST | `/orders` | public, 10 / 10 min / IP | prices from DB, stock in one transaction |
| POST | `/orders/statuses` | public | `{ ids }` → `[{ id, status }]` only |
| POST | `/enquiries` | public, 5 / 10 min / IP | honeypot field `website` |
| POST | `/auth/login` | public, 5 / min / IP | sets cookies |
| POST | `/auth/refresh` | public (refresh cookie) | rotates tokens |
| POST | `/auth/logout` | public | revokes this session |
| POST | `/auth/logout-all` | admin | revokes every session |
| GET | `/auth/me` | admin | |
| POST | `/auth/change-password` | admin | signs out other devices |
| GET / DELETE | `/auth/sessions[/:id]` | admin | own devices |
| GET / POST / PATCH | `/admin/users[/:id]` | ADMIN | `POST /admin/users/:id/reset-password` |
| GET / POST / PUT / DELETE | `/admin/products[/:id]` | ADMIN, STAFF | `maxStock` filter for low stock |
| POST | `/admin/images` | ADMIN, STAFF | multipart field `file`, JPEG/PNG/WebP ≤ 3 MB |
| GET | `/admin/orders[/:id]`, `/admin/orders/summary` | ADMIN, STAFF | |
| PATCH | `/admin/orders/:id/status` | ADMIN, STAFF | Cancelled restocks once, then is final |

Errors are `{ statusCode, error, message }` where `message` is a stable code
(`AUTH_INVALID_CREDENTIALS`, `ORDER_INSUFFICIENT_STOCK`, …) for the frontend to translate.
Validation errors: `{ error: 'DtoValidationError', message: [{ field, errors }] }`.

## Security

| Area | What this API does | vs. old shop / LPMS |
| --- | --- | --- |
| Admin accounts | Individual users with roles `admin` / `staff` | Old shop: one shared password |
| Password storage | scrypt (memory-hard), per-user salt, parameters stored for future upgrades | LPMS: one HMAC-SHA256 round |
| Tokens | Access JWT 15 min + refresh JWT, both httpOnly cookies; refresh cookie scoped to `/api/auth` | Same idea as LPMS |
| Token storage | Only SHA-256 of the refresh token is stored | LPMS stores raw tokens |
| Revocation | Every request checks the session row, so logout, "sign out everywhere", password change and disabling a user apply instantly | |
| Refresh rotation | New refresh token each use; an old one replayed after 30 s revokes the session (theft detection); within 30 s it is treated as a two-tab race (409, retry) | LPMS rotates without reuse detection |
| JWT checks | Pinned HS256, issuer, audience, token type (access ≠ refresh), separate secrets | |
| Brute force | Per-IP rate limit + per-account lockout (5 failures → 15 min); same reply for unknown email, wrong password and locked account; constant-time dummy hash for unknown emails | |
| Route protection | Global guard: routes are closed unless marked `@Public()` | LPMS: open unless `authGuard: true` |
| Roles | Read from the DB on every request, not from the token | |
| CSRF | `OriginGuard` refuses writes from origins not in `CORS_ORIGINS`; SameSite cookies | |
| Input | `whitelist` + `forbidNonWhitelisted`; submitted values never echoed in errors | |
| Orders | Prices from DB; lock rows in id order; stock check + decrement + insert in one transaction; DB `CHECK (stock >= 0)` | Old: row-by-row with manual undo |
| Uploads | Type detected from file bytes (not name/header); size limit; only JPEG/PNG/WebP | Old: trusted the data-URL prefix |
| Product images | URL must be a bundled key, `/images/<id>` or `https://` (blocks `javascript:`) | |
| Headers | Helmet (CSP `default-src 'none'`, nosniff, frame deny, HSTS in production) | |
| Errors | Unknown errors → generic 500 with request id; stack only outside production | |
| Config | Startup fails on missing secrets, secrets < 32 chars, equal secrets, `SameSite=None` without `Secure` | |

## Frontend integration

The shop (`grand-cherokee-parts-hub`, branch `feature/nest-api-auth`) talks to this API through
`src/lib/api/client.ts`:

- `fetch(..., { credentials: 'include' })`; tokens stay in httpOnly cookies, the shop never sees them.
- On `401` with `AUTH_ACCESS_TOKEN_EXPIRED` / `AUTH_UNAUTHORIZED` it calls `POST /auth/refresh` once
  (single-flight, other requests wait) and retries; `409 AUTH_REFRESH_CONCURRENT` counts as success.
  Same idea as LPMS `axios-auth-refresh`, but it never refreshes on a wrong password.
- If the session is gone (signed out elsewhere, disabled, password changed) the admin panel sends the
  user to `/admin/login?redirect=…`.
- Admin routes use `ssr: false` and guard with `GET /auth/me`; public pages still render on the server.
- Error codes are turned into text in `src/lib/api/errors.ts`.

Going live on the existing Neon database:

1. `npm run migration:run` with `DATABASE_URL` + `DATABASE_SSL=true`. It only adds tables, columns,
   indexes and constraints; existing products and orders stay.
2. `npm run seed` with `SEED_ADMIN_*` to create the first admin (existing product ids are skipped).
3. Set `VITE_API_URL` in the frontend's environment (Lovable settings) and `CORS_ORIGINS` here.
4. Prefer the API on a subdomain of the shop (`api.gcparts.am`) and keep `COOKIE_SAME_SITE=lax`.
   On a different site use `COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true`.
5. Remove `ADMIN_PASSWORD`, `SESSION_SECRET` and `DATABASE_URL` from the frontend environment.

## Production notes

- Run behind HTTPS; set `TRUST_PROXY=true` behind a load balancer so rate limits see real client IPs.
- Rate-limit storage is in memory; use a Redis store if you run more than one instance.
- `SWAGGER_ENABLED=false` in production unless the docs are protected.
- Expired and revoked sessions are deleted daily at 03:00 (30-day retention).
# gc-parts-api
