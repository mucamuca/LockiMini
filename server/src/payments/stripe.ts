import type {
  ChargeInput,
  ChargeResult,
  PaymentProvider,
  RefundResult,
  WebhookEvent,
} from './types.js';
import { env } from '../env.js';
import { AppError } from '../http/errors.js';

/**
 * Adaptador Stripe.
 *
 * O SDK nao e dependencia do projeto (o provedor padrao e o mock, que roda sem
 * credencial). Para ligar de verdade:
 *
 *   npm i stripe -w @lockimini/server
 *   PAYMENT_PROVIDER=stripe
 *   STRIPE_SECRET_KEY=sk_test_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * Fluxo: `charge` cria um PaymentIntent com captura automatica e devolve
 * `client_secret` no payload para o front confirmar com Stripe.js. O pedido so
 * vira PAID quando o webhook `payment_intent.succeeded` chega — a mesma rota
 * usada pelo mock, entao nada mais no sistema muda.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly methods = ['credit_card', 'pix', 'boleto'] as const satisfies readonly (
    | 'credit_card'
    | 'pix'
    | 'boleto'
  )[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  private async sdk() {
    if (this.client) return this.client;
    if (!env.STRIPE_SECRET_KEY) {
      throw new AppError(500, 'STRIPE_SECRET_KEY nao configurada.', 'payment_config');
    }
    try {
      // Especificador em variavel: o TypeScript nao tenta resolver um pacote
      // que so existe quando o lojista opta pela Stripe.
      const specifier = 'stripe';
      const mod = (await import(specifier)) as { default: new (key: string) => unknown };
      const Stripe = mod.default;
      this.client = new Stripe(env.STRIPE_SECRET_KEY);
      return this.client;
    } catch {
      throw new AppError(
        500,
        'SDK da Stripe nao instalado. Rode: npm i stripe -w @lockimini/server',
        'payment_sdk_missing',
      );
    }
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const stripe = await this.sdk();
    const methodMap: Record<string, string> = {
      credit_card: 'card',
      pix: 'pix',
      boleto: 'boleto',
    };
    const intent = await stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      payment_method_types: [methodMap[input.method] ?? 'card'],
      receipt_email: input.customer.email,
      description: `Pedido ${input.orderNumber}`,
      metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
    });

    return {
      providerRef: intent.id,
      // Nunca "PAID" aqui: quem confirma e o webhook.
      status: 'PENDING',
      payload: {
        method: input.method,
        clientSecret: intent.client_secret,
        publishableKeyRequired: true,
        instructions: 'Finalize o pagamento na janela segura da Stripe.',
      },
    };
  }

  async refund(providerRef: string, amountCents: number): Promise<RefundResult> {
    const stripe = await this.sdk();
    await stripe.refunds.create({ payment_intent: providerRef, amount: amountCents });
    return { refunded: true, providerRef };
  }

  async parseWebhook(rawBody: Buffer | string, signature?: string): Promise<WebhookEvent> {
    const stripe = await this.sdk();
    if (!env.STRIPE_WEBHOOK_SECRET || !signature) {
      throw new AppError(400, 'Assinatura de webhook ausente.', 'invalid_signature');
    }
    const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    const intentId = event.data?.object?.id as string;
    switch (event.type) {
      case 'payment_intent.succeeded':
        return { type: 'payment.paid', providerRef: intentId, raw: event };
      case 'payment_intent.payment_failed':
        return { type: 'payment.failed', providerRef: intentId, raw: event };
      case 'charge.refunded':
        return {
          type: 'payment.refunded',
          providerRef: (event.data.object.payment_intent as string) ?? intentId,
          raw: event,
        };
      default:
        return { type: 'ignored', providerRef: intentId, raw: event };
    }
  }
}
