// Local development Postgres without Docker: real Postgres binaries (embedded-postgres),
// data kept in .pg-local between runs. Stop with Ctrl+C.
// Usage: npm run db:local   (then use POSTGRES_PORT=5433 in .env)
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const databaseDir = join(process.cwd(), '.pg-local');
const firstRun = !existsSync(databaseDir);

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'postgres',
  password: 'postgres',
  persistent: true,
  onLog: () => {},
});

if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('gc_parts');
console.log(`Local Postgres on localhost:${port}, database gc_parts (data in .pg-local)`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
}
