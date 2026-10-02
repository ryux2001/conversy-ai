import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module.js';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load local overrides first; process.loadEnvFile preserves already-defined values.
for (const fileName of ['.env.local', '.env']) {
  const envPath = resolve(backendRoot, fileName);
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  // await app.listen(Number(process.env.PORT ?? 3001));
}
await bootstrap();
