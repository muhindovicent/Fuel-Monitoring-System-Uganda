import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { rateLimit } from 'express-rate-limit';
import { AppModule } from './module';

async function bootstrap() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace_')) {
    throw new Error('Set a strong JWT_SECRET of 32+ characters');
  }
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const origins = (process.env.FRONTEND_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  app.enableCors({ origin: origins, methods: 'GET,POST', allowedHeaders: 'Content-Type,Authorization' });
  app.use('/api/v1/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api/v1/reports', rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false }));
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
  console.log('MafutaWatch API listening');
}
bootstrap().catch(e => { console.error(e); process.exitCode = 1; });
