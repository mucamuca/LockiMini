import { Router, raw } from 'express';
import { asyncHandler } from '../lib/async.js';
import { getPaymentProvider } from '../payments/index.js';
import { confirmPaymentByRef, failPaymentByRef, refundPaymentByRef } from '../services/orders.js';

export const webhooksRouter = Router();

/**
 * Entrada unica de notificacoes do gateway.
 *
 * Precisa do corpo CRU (a assinatura da Stripe e calculada sobre os bytes
 * originais), por isso o `raw` aqui em vez do express.json global.
 *
 * Sempre responde 200 quando o evento foi entendido: qualquer erro nosso vira
 * log, nunca uma retentativa infinita do provedor. E idempotente — reprocessar
 * o mesmo evento nao muda o estoque duas vezes (ver settleOrderPaid).
 */
webhooksRouter.post(
  '/payments',
  raw({ type: '*/*' }),
  asyncHandler(async (req, res) => {
    const provider = getPaymentProvider();
    const signature = req.header('stripe-signature') ?? req.header('x-signature') ?? undefined;

    let event;
    try {
      event = await provider.parseWebhook(req.body as Buffer, signature);
    } catch (err) {
      console.error('[webhook] payload invalido', err);
      return res.status(400).json({ error: { code: 'invalid_payload', message: 'Payload invalido.' } });
    }

    try {
      switch (event.type) {
        case 'payment.paid':
          await confirmPaymentByRef(event.providerRef);
          break;
        case 'payment.failed':
          await failPaymentByRef(event.providerRef);
          break;
        case 'payment.refunded':
          await refundPaymentByRef(event.providerRef);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`[webhook] falha ao processar ${event.type} (${event.providerRef})`, err);
    }

    res.json({ received: true, type: event.type });
  }),
);
