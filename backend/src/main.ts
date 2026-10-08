import { NestFactory } from '@nestjs/core';
import 'dotenv/config';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DatabaseFilter } from './database.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new DatabaseFilter());
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? '127.0.0.1');
}
void bootstrap();
