import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('file:./dev.db'),
  JWT_SECRET: z.string().min(16).default('dev-secret-troque-em-producao-please-32'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_DOMAIN: z.string().optional(),
  /** "mock" roda sem nenhuma credencial. "stripe" exige STRIPE_SECRET_KEY. */
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Minutos que uma reserva de estoque sobrevive sem pagamento confirmado. */
  RESERVATION_TTL_MINUTES: z.coerce.number().default(20),
  FREE_SHIPPING_THRESHOLD_CENTS: z.coerce.number().default(29900),
  FLAT_SHIPPING_CENTS: z.coerce.number().default(2490),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variaveis de ambiente invalidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

if (env.PAYMENT_PROVIDER === 'stripe' && !env.STRIPE_SECRET_KEY) {
  console.warn('[pagamentos] PAYMENT_PROVIDER=stripe sem STRIPE_SECRET_KEY — voltando para o provedor mock.');
}
