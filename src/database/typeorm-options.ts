import { DataSourceOptions } from 'typeorm';
import { DatabaseConfig } from '../config/app-config';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';

export function buildTypeOrmOptions(db: DatabaseConfig): DataSourceOptions {
  const connection = db.url
    ? { url: db.url }
    : {
        host: db.host,
        port: db.port,
        username: db.username,
        password: db.password,
        database: db.database,
      };
  return {
    type: 'postgres',
    ...connection,
    ssl: db.ssl ? { rejectUnauthorized: true } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    // Schema changes only ever go through migrations.
    synchronize: false,
    logging: db.logging,
    extra: { max: 10 },
  };
}
