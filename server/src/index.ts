import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './env.js';
import { initDatabase, prisma } from './db.js';
import { initRealtime } from './realtime.js';
import { startStockJanitor } from './services/stock.js';
import { optionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { imagesRouter } from './routes/images.js';
import { cartRouter } from './routes/cart.js';
import { checkoutRouter } from './routes/checkout.js';
import { ordersRouter } from './routes/orders.js';
import { webhooksRouter } from './routes/webhooks.js';
import { adminRouter } from './routes/admin/index.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  }),
);

// Webhooks vem ANTES do express.json: a verificacao de assinatura precisa dos
// bytes originais do corpo, que um parser JSON ja teria consumido.
app.use('/api/webhooks', webhooksRouter);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(optionalAuth);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'lockimini-api',
    env: env.NODE_ENV,
    paymentProvider: env.PAYMENT_PROVIDER,
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/images', imagesRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/cart', cartRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
initRealtime(server);

await initDatabase();
startStockJanitor();

server.listen(env.PORT, () => {
  console.log(`\n  LockiMini API`);
  console.log(`  http://localhost:${env.PORT}/api/health`);
  console.log(`  tempo real: ws://localhost:${env.PORT}/realtime`);
  console.log(`  gateway: ${env.PAYMENT_PROVIDER}`);
  console.log(`  origem web liberada: ${env.WEB_ORIGIN}\n`);
});

async function shutdown(signal: string) {
  console.log(`\n[${signal}] encerrando...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
