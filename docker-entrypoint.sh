#!/bin/sh
# Container start: apply pending migrations, optionally create the first admin, then run the API.
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations"
  node node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
fi

if [ -n "$SEED_ADMIN_EMAIL" ] && [ -n "$SEED_ADMIN_PASSWORD" ]; then
  echo "Creating first admin if none exists"
  SEED_SKIP_PRODUCTS="${SEED_SKIP_PRODUCTS:-true}" node dist/database/seeds/run-seed.js || echo "Seed failed; continuing"
fi

exec node dist/main.js
