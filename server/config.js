import { z } from 'zod';

export function configuration(env = process.env) {
  const data = z.object({
    NODE_ENV: z.enum(['development','production','test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z.url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1),
    PGSSLMODE: z.enum(['disable','verify-full']).default('disable'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    LOG_LEVEL: z.enum(['silent','error','warn','info','debug']).default('info'),
    ROUTING_URL: z.union([z.literal(''),z.url()]).default(''),
    EMAIL_PROVIDER: z.enum(['','smtp','http']).default(''),
    EMAIL_FROM: z.string().trim().max(254).default(''),
    EMAIL_SMTP_HOST: z.string().trim().max(255).default(''),
    EMAIL_SMTP_PORT: z.union([z.literal(''),z.coerce.number().int().min(1).max(65535)]).default(587),
    EMAIL_SMTP_SECURE: z.enum(['','true','false']).default(''),
    EMAIL_SMTP_USER: z.string().trim().max(255).default(''),
    EMAIL_SMTP_PASSWORD: z.string().max(512).default(''),
    EMAIL_HTTP_URL: z.union([z.literal(''),z.url()]).default(''),
    EMAIL_HTTP_API_KEY: z.string().max(512).default(''),
  }).parse(env);
  const origin = new URL(data.APP_ORIGIN);
  if (origin.origin !== data.APP_ORIGIN || origin.username || origin.password) throw new Error('APP_ORIGIN must be an origin without a path or credentials');
  if (data.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Production requires HTTPS APP_ORIGIN');
  if (data.ROUTING_URL && new URL(data.ROUTING_URL).protocol !== 'https:') throw new Error('ROUTING_URL must use HTTPS');
  if (data.EMAIL_PROVIDER) {
    if (!data.EMAIL_FROM) throw new Error('EMAIL_FROM is required when EMAIL_PROVIDER is set.');
    if (data.EMAIL_PROVIDER === 'smtp' && !data.EMAIL_SMTP_HOST) throw new Error('EMAIL_SMTP_HOST is required for the smtp email provider.');
    if (data.EMAIL_PROVIDER === 'http') {
      if (!data.EMAIL_HTTP_URL) throw new Error('EMAIL_HTTP_URL is required for the http email provider.');
      if (data.NODE_ENV === 'production' && new URL(data.EMAIL_HTTP_URL).protocol !== 'https:') throw new Error('Production EMAIL_HTTP_URL must use HTTPS');
    }
  }
  return data;
}
