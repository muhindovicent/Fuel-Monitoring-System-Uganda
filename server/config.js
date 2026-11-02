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
  }).parse(env);
  const origin = new URL(data.APP_ORIGIN);
  if (origin.origin !== data.APP_ORIGIN || origin.username || origin.password) throw new Error('APP_ORIGIN must be an origin without a path or credentials');
  if (data.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Production requires HTTPS APP_ORIGIN');
  if (data.ROUTING_URL && new URL(data.ROUTING_URL).protocol !== 'https:') throw new Error('ROUTING_URL must use HTTPS');
  return data;
}
