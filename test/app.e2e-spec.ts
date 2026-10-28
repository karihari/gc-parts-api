import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { InjectOptions, LightMyRequestResponse } from 'fastify';
import { DataSource } from 'typeorm';
import { createApp } from '../src/app.factory';
import { PasswordService } from '../src/auth/services/password.service';
import { validateEnv } from '../src/config/env.validation';
import { buildConfig } from '../src/config/app-config';
import { buildTypeOrmOptions } from '../src/database/typeorm-options';
import { AdminRole, AdminUserEntity, ProductEntity } from '../src/database/entities';

const ORIGIN = 'http://shop.test';
const ADMIN = { email: 'admin@gcparts.test', password: 'admin-password-1' };
const STAFF = { email: 'staff@gcparts.test', password: 'staff-password-1' };
const LOCKME = { email: 'lockme@gcparts.test', password: 'lockme-password-1' };

let app: NestFastifyApplication;
let db: DataSource;
let ipCounter = 0;

// Each call gets its own client IP so the per-IP login rate limit does not
// interfere with tests that are not about rate limiting.
const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

type Jar = Record<string, string>;

function cookiesFrom(res: LightMyRequestResponse): Jar {
  const jar: Jar = {};
  for (const c of res.cookies as { name: string; value: string }[]) jar[c.name] = c.value;
  return jar;
}

function cookieHeader(jar: Jar): string {
  return Object.entries(jar)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function call(opts: InjectOptions & { jar?: Jar; ip?: string }): Promise<LightMyRequestResponse> {
  const { jar, ip, headers, ...rest } = opts;
  return app.inject({
    ...rest,
    remoteAddress: ip ?? nextIp(),
    headers: { ...(jar ? { cookie: cookieHeader(jar) } : {}), ...headers },
  });
}

async function login(user: { email: string; password: string }, rememberMe = false): Promise<Jar> {
  const res = await call({
    method: 'POST',
    url: '/api/auth/login',
    payload: { ...user, rememberMe },
  });
  expect(res.statusCode).toBe(200);
  return cookiesFrom(res);
}

function multipart(fieldName: string, filename: string, bytes: Buffer) {
  const boundary = '----gcparts' + Date.now();
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
        `Content-Type: image/png\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

const productBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Front Grille Chrome',
  category: 'body',
  brand: 'Mopar',
  partNumber: '68143045AC',
  price: 129000,
  oldPrice: null,
  stock: 4,
  image: 'body',
  description: 'Front grille with chrome inserts.',
  fits: [{ gen: 'WK2', from: 2014, to: 2016 }],
  featured: false,
  ...overrides,
});

beforeAll(async () => {
  const config = buildConfig(validateEnv(process.env));
  db = new DataSource(buildTypeOrmOptions(config.database));
  await db.initialize();

  // The tables exactly as the Drizzle version of the shop created them, with live data,
  // to prove the migration keeps an existing database intact.
  await db.query(`
    CREATE TABLE products (
      id text PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL, category text NOT NULL,
      brand text NOT NULL, part_number text NOT NULL, price integer NOT NULL, old_price integer,
      stock integer NOT NULL DEFAULT 0, rating real NOT NULL DEFAULT 0, reviews integer NOT NULL DEFAULT 0,
      image text NOT NULL, description text NOT NULL, fits jsonb NOT NULL DEFAULT '[]'::jsonb,
      featured boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`
    CREATE TABLE orders (
      id text PRIMARY KEY, name text NOT NULL, phone text NOT NULL, email text NOT NULL,
      payment text NOT NULL, items jsonb NOT NULL, total integer NOT NULL,
      status text NOT NULL DEFAULT 'New', created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`
    INSERT INTO products (id, slug, name, category, brand, part_number, price, stock, image, description, fits)
    VALUES ('GC-LEGACY', 'legacy-part', 'Legacy Part', 'engine', 'Mopar', 'L-1', 1000, 2, 'engine', 'old row',
            '[{"gen":"WK","from":2005,"to":2010}]')`);
  await db.query(`
    INSERT INTO orders (id, name, phone, email, payment, items, total)
    VALUES ('ORD-LEGACY0001', 'Old Customer', '+374 11111111', 'old@x.am', 'cash',
            '[{"productId":"GC-LEGACY","name":"Legacy Part","price":1000,"qty":1}]', 1000)`);

  await db.runMigrations();
  // Running again must be a no-op.
  expect(await db.runMigrations()).toHaveLength(0);

  const passwords = new PasswordService();
  const users = db.getRepository(AdminUserEntity);
  for (const [u, role] of [
    [ADMIN, AdminRole.ADMIN],
    [STAFF, AdminRole.STAFF],
    [LOCKME, AdminRole.STAFF],
  ] as const) {
    await users.save(
      users.create({
        email: u.email,
        name: u.email,
        role,
        passwordHash: await passwords.hash(u.password),
      }),
    );
  }

  const products = db.getRepository(ProductEntity);
  await products.insert([
    {
      id: 'GC-1001',
      slug: 'front-brake-disc',
      name: 'Front Brake Disc',
      category: 'brakes',
      brand: 'Brembo',
      partNumber: '09.B356.11',
      price: 46500,
      oldPrice: 52000,
      stock: 12,
      rating: 4.8,
      reviews: 126,
      image: 'brakes',
      description: 'Rotor',
      featured: true,
      fits: [{ gen: 'WK2' as never, from: 2011, to: 2021 }],
    },
    {
      id: 'GC-2001',
      slug: 'oil-filter-housing',
      name: 'Oil Filter Housing',
      category: 'engine',
      brand: 'Mopar',
      partNumber: '68105583AF',
      price: 118000,
      oldPrice: null,
      stock: 3,
      rating: 4.9,
      reviews: 88,
      image: 'engine',
      description: 'Housing',
      featured: false,
      fits: [{ gen: 'WK2' as never, from: 2011, to: 2021, engines: ['3.6L V6'] }],
    },
  ]);

  app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

describe('migration on an existing Drizzle database', () => {
  it('keeps old products and orders and serves them', async () => {
    const res = await call({ method: 'GET', url: '/api/products/legacy-part' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 'GC-LEGACY', stock: 2 });
    const [order] = await db.query(`SELECT id, updated_at FROM orders WHERE id = 'ORD-LEGACY0001'`);
    expect(order.updated_at).toBeTruthy();
  });

  it('adds the non-negative stock constraint', async () => {
    await expect(db.query(`UPDATE products SET stock = -1 WHERE id = 'GC-LEGACY'`)).rejects.toThrow(
      /products_stock_non_negative/,
    );
  });
});

describe('auth', () => {
  it('protects admin routes by default', async () => {
    const res = await call({ method: 'GET', url: '/api/admin/products' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('AUTH_UNAUTHORIZED');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN.email, password: 'nope-nope-nope' },
    });
    const unknown = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@gcparts.test', password: 'nope-nope-nope' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().message).toBe('AUTH_INVALID_CREDENTIALS');
    expect(unknown.json().message).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('signs in with httpOnly cookies and never returns secrets', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ' ADMIN@gcparts.test ', password: ADMIN.password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ email: ADMIN.email, role: 'admin' });
    expect(JSON.stringify(body)).not.toMatch(/password|hash|token/i);

    const cookies = res.cookies as {
      name: string;
      httpOnly?: boolean;
      path?: string;
      maxAge?: number;
    }[];
    const access = cookies.find((c) => c.name === 'accessToken');
    const refresh = cookies.find((c) => c.name === 'refreshToken');
    expect(access).toMatchObject({ httpOnly: true, path: '/' });
    // Scoped to the auth routes; no maxAge without "remember me" = ends with the browser.
    expect(refresh).toMatchObject({ httpOnly: true, path: '/api/auth' });
    expect(refresh?.maxAge).toBeUndefined();
  });

  it('accepts the cookie and a Bearer header', async () => {
    const jar = await login(ADMIN);
    const viaCookie = await call({ method: 'GET', url: '/api/auth/me', jar });
    expect(viaCookie.json()).toMatchObject({ email: ADMIN.email });
    const viaBearer = await call({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${jar.accessToken}` },
    });
    expect(viaBearer.statusCode).toBe(200);
  });

  it('rotates refresh tokens, tolerates a two-tab race, and kills the session on replay', async () => {
    const first = await login(ADMIN);

    const refreshed = await call({ method: 'POST', url: '/api/auth/refresh', jar: first });
    expect(refreshed.statusCode).toBe(200);
    const second = { ...first, ...cookiesFrom(refreshed) };
    expect(second.refreshToken).not.toEqual(first.refreshToken);

    // Another tab sends the old token a moment later: harmless, ask it to retry.
    const race = await call({ method: 'POST', url: '/api/auth/refresh', jar: first });
    expect(race.statusCode).toBe(409);
    expect(race.json().message).toBe('AUTH_REFRESH_CONCURRENT');

    // The same old token much later means it was stolen.
    await db.query(`UPDATE auth_sessions SET rotated_at = now() - interval '1 hour'`);
    const replay = await call({ method: 'POST', url: '/api/auth/refresh', jar: first });
    expect(replay.statusCode).toBe(401);

    // ...and the legitimate holder is signed out too, until they log in again.
    const after = await call({ method: 'GET', url: '/api/auth/me', jar: second });
    expect(after.statusCode).toBe(401);
    expect(after.json().message).toBe('AUTH_SESSION_REVOKED');
    const [row] = await db.query(
      `SELECT count(*)::int AS n FROM auth_sessions WHERE revoked_reason = 'reuse_detected'`,
    );
    expect(row.n).toBe(1);
  });

  it('logout makes a still-unexpired access token useless at once', async () => {
    const jar = await login(ADMIN);
    const out = await call({ method: 'POST', url: '/api/auth/logout', jar });
    expect(out.statusCode).toBe(200);
    const me = await call({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${jar.accessToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('locks an account after repeated failures, even for the right password', async () => {
    for (let i = 0; i < 3; i++) {
      await call({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: LOCKME.email, password: 'wrong-wrong-1' },
      });
    }
    const res = await call({ method: 'POST', url: '/api/auth/login', payload: LOCKME });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rate-limits login attempts per IP', async () => {
    const ip = '192.0.2.77';
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await call({
        method: 'POST',
        url: '/api/auth/login',
        ip,
        payload: { email: 'x@y.test', password: 'whatever-123' },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('changing password signs out the other devices but keeps this one', async () => {
    const laptop = await login(STAFF);
    const phone = await login(STAFF);
    const res = await call({
      method: 'POST',
      url: '/api/auth/change-password',
      jar: laptop,
      payload: { currentPassword: STAFF.password, newPassword: 'staff-password-2' },
    });
    expect(res.statusCode).toBe(200);
    expect((await call({ method: 'GET', url: '/api/auth/me', jar: laptop })).statusCode).toBe(200);
    expect((await call({ method: 'GET', url: '/api/auth/me', jar: phone })).statusCode).toBe(401);
    STAFF.password = 'staff-password-2';
  });
});

describe('roles and admin users', () => {
  it('staff cannot manage admin users; admin can', async () => {
    const staff = await login(STAFF);
    expect((await call({ method: 'GET', url: '/api/admin/users', jar: staff })).statusCode).toBe(
      403,
    );
    const admin = await login(ADMIN);
    const res = await call({ method: 'GET', url: '/api/admin/users', jar: admin });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toMatch(/passwordHash|failedLogin/);
  });

  it('disabling a user ends their open sessions immediately', async () => {
    const admin = await login(ADMIN);
    const created = await call({
      method: 'POST',
      url: '/api/admin/users',
      jar: admin,
      payload: {
        email: 'temp@gcparts.test',
        name: 'Temp',
        role: 'staff',
        password: 'temp-password-1',
      },
    });
    expect(created.statusCode).toBe(201);
    const temp = await login({ email: 'temp@gcparts.test', password: 'temp-password-1' });

    const disabled = await call({
      method: 'PATCH',
      url: `/api/admin/users/${created.json().id}`,
      jar: admin,
      payload: { isActive: false },
    });
    expect(disabled.statusCode).toBe(200);
    expect((await call({ method: 'GET', url: '/api/auth/me', jar: temp })).statusCode).toBe(401);
  });

  it('an admin cannot demote or disable themselves', async () => {
    const admin = await login(ADMIN);
    const me = (await call({ method: 'GET', url: '/api/auth/me', jar: admin })).json();
    const res = await call({
      method: 'PATCH',
      url: `/api/admin/users/${me.id}`,
      jar: admin,
      payload: { role: 'staff' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('USER_CANNOT_CHANGE_SELF');
  });
});

describe('request hardening', () => {
  it('refuses writes from a foreign origin (CSRF)', async () => {
    const jar = await login(ADMIN);
    const res = await call({
      method: 'POST',
      url: '/api/admin/products',
      jar,
      headers: { origin: 'https://evil.example' },
      payload: productBody(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('rejects fields that are not part of the DTO', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/orders',
      headers: { origin: ORIGIN },
      payload: {
        name: 'Ani',
        phone: '+374 98281116',
        email: 'ani@x.am',
        payment: 'cash',
        items: [{ productId: 'GC-1001', qty: 1, price: 1 }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('DtoValidationError');
  });

  it('never leaks submitted values in validation errors', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email', password: 'secret-value-123' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('secret-value-123');
  });

  it('sends security headers', async () => {
    const res = await call({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('products', () => {
  it('filters by vehicle the same way the frontend checkFit does', async () => {
    const fits = async (qs: string) =>
      (await call({ method: 'GET', url: `/api/products?${qs}` }))
        .json()
        .data.map((p: { id: string }) => p.id)
        .sort();

    expect(await fits('gen=WK2&year=2015&engine=3.6L%20V6')).toEqual(['GC-1001', 'GC-2001']);
    // The housing lists only the 3.6L engine.
    expect(await fits('gen=WK2&year=2015&engine=5.7L%20V8%20HEMI')).toEqual(['GC-1001']);
    expect(await fits('gen=WK&year=2008')).toEqual(['GC-LEGACY']);
    expect(await fits('gen=WL&year=2023')).toEqual([]);
  });

  it('searches, sorts and paginates', async () => {
    const res = await call({
      method: 'GET',
      url: '/api/products?q=brake&perPage=1&sort=price_asc',
    });
    expect(res.json().meta).toMatchObject({ page: 1, perPage: 1, total: 1 });
    // LIKE wildcards in the search are taken literally.
    const wild = await call({ method: 'GET', url: '/api/products?q=%25' });
    expect(wild.json().meta.total).toBe(0);
  });

  it('validates admin product input', async () => {
    const jar = await login(STAFF);
    const badPrice = await call({
      method: 'POST',
      url: '/api/admin/products',
      jar,
      payload: productBody({ oldPrice: 100 }),
    });
    expect(badPrice.json().message).toBe('PRODUCT_OLD_PRICE_NOT_HIGHER');
    const badImage = await call({
      method: 'POST',
      url: '/api/admin/products',
      jar,
      payload: productBody({ image: 'javascript:alert(1)' }),
    });
    expect(badImage.statusCode).toBe(400);
  });

  it('creates products with unique slugs and updates them', async () => {
    const jar = await login(STAFF);
    const a = await call({
      method: 'POST',
      url: '/api/admin/products',
      jar,
      payload: productBody(),
    });
    const b = await call({
      method: 'POST',
      url: '/api/admin/products',
      jar,
      payload: productBody(),
    });
    expect(a.statusCode).toBe(201);
    expect(a.json().slug).toBe('front-grille-chrome');
    expect(b.json().slug).toBe('front-grille-chrome-2');

    const updated = await call({
      method: 'PUT',
      url: `/api/admin/products/${b.json().id}`,
      jar,
      payload: productBody({ name: 'Front Grille Black', price: 99000, oldPrice: 129000 }),
    });
    expect(updated.json()).toMatchObject({ slug: 'front-grille-black', price: 99000 });

    const del = await call({ method: 'DELETE', url: `/api/admin/products/${b.json().id}`, jar });
    expect(del.statusCode).toBe(204);
  });
});

describe('orders', () => {
  const order = (items: { productId: string; qty: number }[]) => ({
    method: 'POST' as const,
    url: '/api/orders',
    headers: { origin: ORIGIN },
    payload: { name: 'Ani', phone: '+374 98281116', email: 'Ani@X.am', payment: 'card', items },
  });

  it('prices from the database and takes stock in one go', async () => {
    const res = await call(
      order([
        { productId: 'GC-1001', qty: 1 },
        { productId: 'GC-1001', qty: 1 },
      ]),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      total: 93000,
      status: 'New',
      items: [{ productId: 'GC-1001', name: 'Front Brake Disc', price: 46500, qty: 2 }],
    });
    const [p] = await db.query(`SELECT stock FROM products WHERE id = 'GC-1001'`);
    expect(p.stock).toBe(10);
  });

  it('refuses an order that exceeds stock and leaves stock untouched', async () => {
    const res = await call(
      order([
        { productId: 'GC-1001', qty: 1 },
        { productId: 'GC-2001', qty: 99 },
      ]),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      message: 'ORDER_INSUFFICIENT_STOCK',
      productId: 'GC-2001',
      available: 3,
    });
    const rows = await db.query(
      `SELECT id, stock FROM products WHERE id IN ('GC-1001','GC-2001') ORDER BY id`,
    );
    expect(rows.map((r: { stock: number }) => r.stock)).toEqual([10, 3]);
  });

  it('never oversells when customers check out at the same moment', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call(order([{ productId: 'GC-2001', qty: 1 }]))),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 201, 201, 409, 409, 409]);
    const [p] = await db.query(`SELECT stock FROM products WHERE id = 'GC-2001'`);
    expect(p.stock).toBe(0);
  });

  it('cancelling restocks exactly once', async () => {
    const placed = (await call(order([{ productId: 'GC-1001', qty: 2 }]))).json();
    const jar = await login(STAFF);
    const statusUrl = `/api/admin/orders/${placed.id}/status`;

    const cancel = await call({
      method: 'PATCH',
      url: statusUrl,
      jar,
      payload: { status: 'Cancelled' },
    });
    expect(cancel.json().status).toBe('Cancelled');
    const again = await call({
      method: 'PATCH',
      url: statusUrl,
      jar,
      payload: { status: 'Cancelled' },
    });
    expect(again.statusCode).toBe(409);

    const [p] = await db.query(`SELECT stock FROM products WHERE id = 'GC-1001'`);
    expect(p.stock).toBe(10);
  });

  it('lets a customer see only id and status of their orders', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/orders/statuses',
      headers: { origin: ORIGIN },
      payload: { ids: ['ORD-LEGACY0001'] },
    });
    expect(res.json()).toEqual([{ id: 'ORD-LEGACY0001', status: 'New' }]);
  });

  it('summarises orders for the dashboard', async () => {
    const jar = await login(STAFF);
    const res = await call({ method: 'GET', url: '/api/admin/orders/summary', jar });
    expect(res.json().countByStatus.Cancelled).toBe(1);
  });
});

describe('images', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32, 1),
  ]);

  it('stores a real image and serves it back', async () => {
    const jar = await login(STAFF);
    const { body, contentType } = multipart('file', 'photo.png', png);
    const up = await call({
      method: 'POST',
      url: '/api/admin/images',
      jar,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(up.statusCode).toBe(201);
    expect(up.json().url).toMatch(/^\/images\/[a-f0-9]{32}$/);

    const served = await call({ method: 'GET', url: `/api${up.json().url}` });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.rawPayload.equals(png)).toBe(true);
  });

  it('rejects an HTML file renamed to .png', async () => {
    const jar = await login(STAFF);
    const { body, contentType } = multipart(
      'file',
      'x.png',
      Buffer.from('<script>alert(1)</script>'),
    );
    const res = await call({
      method: 'POST',
      url: '/api/admin/images',
      jar,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(415);
  });
});
