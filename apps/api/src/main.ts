import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './modules/app.module';
import { loadEnv } from './config/env';
import { join } from 'path';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  // Serve uploaded files in dev (STORAGE_MODE=local)
  const uploadsDir = env.STORAGE_LOCAL_DIR || './uploads';
  app.useStaticAssets(join(process.cwd(), uploadsDir), { prefix: '/uploads/' });

  const config = new DocumentBuilder()
    .setTitle('Naqlo API')
    .setDescription('Naqlo MVP API')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.PORT);
  // eslint-disable-next-line no-console
  console.log(`Naqlo API listening on :${env.PORT}`);
}

bootstrap();
