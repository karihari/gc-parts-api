import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { DtoValidationException } from './common/exceptions/dto-validation.exception';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { MAX_IMAGE_BYTES } from './images/controllers/images.controller';

// Shared by main.ts and the e2e tests, so tests run against the real setup.
export async function createApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    // JSON bodies are small; image uploads are capped separately by multipart limits.
    bodyLimit: 256 * 1024,
    genReqId: () => randomUUID(),
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  await app.register(fastifyHelmet, {
    // A JSON API serves no HTML, so the strictest policy costs nothing. Swagger UI needs inline assets.
    contentSecurityPolicy: config.swaggerEnabled
      ? false
      : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5, parts: 6 },
  });

  app.enableCors({
    origin: config.corsOrigins,
    // Needed for the auth cookies.
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization'],
    maxAge: 600,
  });

  app.setGlobalPrefix(config.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // Unknown fields are rejected rather than silently dropped, so a client cannot
      // try to set things like `role` or `stock` through a form that does not offer them.
      whitelist: true,
      forbidNonWhitelisted: true,
      // Never echo submitted values (passwords) in error messages.
      validationError: { target: false, value: false },
      exceptionFactory: (errors) => new DtoValidationException(errors),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(!config.isProduction));
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Grand Cherokee Parts Hub API')
        .setDescription('Public shop endpoints and the cookie-authenticated admin API')
        .setVersion(process.env.npm_package_version ?? '0.1.0')
        .addCookieAuth('accessToken')
        .build(),
    );
    SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document);
    Logger.log(`Swagger UI at /${config.apiPrefix}/docs`, 'Bootstrap');
  }

  return app;
}
