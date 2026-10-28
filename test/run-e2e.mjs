// Starts a throwaway Postgres (real binaries via embedded-postgres), runs the e2e
// suite against it, then deletes it. No Docker or local Postgres needed.
// Usage: npm run test:e2e
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const freePort = () =>
  new Promise((resolve) => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const port = await freePort();
const databaseDir = join(process.cwd(), '.pg-test');
rmSync(databaseDir, { recursive: true, force: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'postgres',
  password: 'postgres',
  persistent: false,
  onLog: () => {},
});

let status = 1;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('gc_parts_test');

  const result = spawnSync(
    process.execPath,
    // @fastify/cookie loads the ESM "cookie" package with import(), which Jest only allows with this flag.
    ['--experimental-vm-modules', '--no-warnings', 'node_modules/jest/bin/jest.js', '--config', 'test/jest-e2e.json', '--runInBand', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        POSTGRES_HOST: 'localhost',
        POSTGRES_PORT: String(port),
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
        POSTGRES_DB: 'gc_parts_test',
        JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789-abcdefghij',
        JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789-abcdefghij',
        CORS_ORIGINS: 'http://shop.test',
        LOGIN_MAX_ATTEMPTS: '3',
        MAKE_WEBHOOK_URL: '',
      },
    },
  );
  status = result.status ?? 1;
} finally {
  await pg.stop();
  rmSync(databaseDir, { recursive: true, force: true });
}
process.exit(status);
