import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { loadEnvFile } from './config/load-env';

loadEnvFile();

async function bootstrap(): Promise<void> {
  // Imported after .env is loaded so module-level reads see the variables.
  const { createApp } = await import('./app.factory');
  const { APP_CONFIG } = await import('./config/app-config');

  const app = await createApp();
  const config = app.get(APP_CONFIG);
  await app.listen(config.port, config.host);
  Logger.log(`API listening on ${config.host}:${config.port}/${config.apiPrefix}`, 'Bootstrap');
}

bootstrap().catch((error: Error) => {
  Logger.error(error.message, error.stack, 'Bootstrap');
  process.exit(1);
});
