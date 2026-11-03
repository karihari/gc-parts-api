#!/bin/sh
# Container start: apply pending migrations, optionally create the first admin, then run the API.
set -e

# Log which database we connect to (host only, never the password).
node -e '
  const u = process.env.DATABASE_URL;
  if (!u) { console.log("DATABASE_URL is not set"); process.exit(0); }
  try { const p = new URL(u); console.log("Database host:", p.hostname, "name:", p.pathname.slice(1)); }
  catch { console.log("DATABASE_URL is not a valid URL; it starts with", JSON.stringify(u.slice(0, 12))); }
'

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations"
  node node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
fi

if [ -n "$SEED_ADMIN_EMAIL" ] && [ -n "$SEED_ADMIN_PASSWORD" ]; then
  echo "Creating first admin if none exists"
  SEED_SKIP_PRODUCTS="${SEED_SKIP_PRODUCTS:-true}" node dist/database/seeds/run-seed.js || echo "Seed failed; continuing"
fi

exec node dist/main.js
