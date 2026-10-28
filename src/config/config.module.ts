import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, buildConfig } from './app-config';
import { validateEnv } from './env.validation';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => buildConfig(validateEnv(process.env)),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
