// Used by the TypeORM CLI (npm run migration:*). Needs only the database variables.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnvFile } from '../config/load-env';
import { buildTypeOrmOptions } from './typeorm-options';

loadEnvFile();

const env = process.env;

export default new DataSource(
  buildTypeOrmOptions({
    url: env.DATABASE_URL,
    host: env.POSTGRES_HOST ?? 'localhost',
    port: Number(env.POSTGRES_PORT ?? 5432),
    username: env.POSTGRES_USER ?? 'postgres',
    password: env.POSTGRES_PASSWORD ?? 'postgres',
    database: env.POSTGRES_DB ?? 'gc_parts',
    ssl: ['true', '1'].includes(env.DATABASE_SSL ?? ''),
    logging: ['true', '1'].includes(env.TYPEORM_LOGGING ?? ''),
  }),
);
