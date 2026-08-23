import crypto from 'node:crypto';
import type {
  ChargeInput,
  ChargeResult,
  PaymentProvider,
  RefundResult,
  WebhookEvent,
} from './types.js';

const ref = (prefix: string) => `${prefix}_${crypto.randomBytes(10).toString('hex')}`;

/** Luhn — rejeita numero de cartao digitado errado antes de "processar". */
function luhnValid(number: string) {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Gateway simulado — roda sem nenhuma credencial e cobre os caminhos que
 * importam em desenvolvimento: aprovado, recusado, sem saldo e pendente.
 *
 * Cartoes de teste (qualquer validade futura / CVV de 3 digitos):
 *   4242 4242 4242 4242 → aprovado
 *   4000 0000 0000 0002 → recusado pelo emissor
 *   4000 0000 0000 9995 → saldo insuficiente
 *   5555 5555 5555 4444 → aprovado (bandeira alternativa)
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly methods = ['credit_card', 'pix', 'boleto'] as const satisfies readonly (
    | 'credit_card'
    | 'pix'
    | 'boleto'
  )[];

  async charge(input: ChargeInput): Promise<ChargeResult> {
    // Latencia artificial: o front precisa lidar com estado de carregamento.
    await new Promise((r) => setTimeout(r, 350));

    if (input.method === 'pix') {
      const code = ref('pix');
      return {
        providerRef: code,
        status: 'PENDING',
        payload: {
          method: 'pix',
          qrCode: `00020126580014BR.GOV.BCB.PIX0136${code}5204000053039865802BR5913LOCKIMINI6009SAO PAULO62070503***6304`,
          copyPaste: `00020126580014BR.GOV.BCB.PIX0136${code}`,
          expiresInMinutes: 30,
          instructions: 'Abra o app do banco, escolha Pix Copia e Cola e finalize o pagamento.',
        },
      };
    }

    if (input.method === 'boleto') {
      const code = ref('bol');
      const line = Array.from({ length: 5 }, () =>
        String(Math.floor(Math.random() * 1e10)).padStart(10, '0'),
      ).join(' ');
      return {
        providerRef: code,
        status: 'PENDING',
        payload: {
          method: 'boleto',
          digitableLine: line,
          dueDate: new Date(Date.now() + 3 * 864e5).toISOString(),
          instructions: 'O pedido e confirmado em ate 2 dias uteis apos o pagamento do boleto.',
        },
      };
    }

    const card = input.card;
    if (!card) {
      return { providerRef: ref('err'), status: 'FAILED', failureCode: 'missing_card', failureMessage: 'Dados do cartao ausentes.' };
    }

    const digits = card.number.replace(/\D/g, '');
    if (!luhnValid(digits)) {
      return {
        providerRef: ref('err'),
        status: 'FAILED',
        failureCode: 'invalid_number',
        failureMessage: 'Numero de cartao invalido.',
      };
    }

    const now = new Date();
    const expired =
      card.expYear < now.getFullYear() ||
      (card.expYear === now.getFullYear() && card.expMonth < now.getMonth() + 1);
    if (expired) {
      return {
        providerRef: ref('err'),
        status: 'FAILED',
        failureCode: 'expired_card',
        failureMessage: 'Cartao vencido.',
      };
    }

    if (digits.endsWith('0002')) {
      return {
        providerRef: ref('ch'),
        status: 'FAILED',
        failureCode: 'card_declined',
        failureMessage: 'Pagamento recusado pelo emissor do cartao.',
      };
    }
    if (digits.endsWith('9995')) {
      return {
        providerRef: ref('ch'),
        status: 'FAILED',
        failureCode: 'insufficient_funds',
        failureMessage: 'Saldo insuficiente.',
      };
    }

    return {
      providerRef: ref('ch'),
      status: 'PAID',
      payload: {
        method: 'credit_card',
        brand: digits.startsWith('4') ? 'visa' : digits.startsWith('5') ? 'mastercard' : 'card',
        last4: digits.slice(-4),
        installments: card.installments ?? 1,
        authorizationCode: crypto.randomBytes(3).toString('hex').toUpperCase(),
      },
    };
  }

  async refund(providerRef: string): Promise<RefundResult> {
    await new Promise((r) => setTimeout(r, 200));
    return { refunded: true, providerRef };
  }

  /** No mock, o "webhook" e o proprio endpoint de simulacao — payload em JSON puro. */
  async parseWebhook(rawBody: Buffer | string): Promise<WebhookEvent> {
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as {
      type?: string;
      providerRef?: string;
    };
    const type =
      body.type === 'payment.paid' ||
      body.type === 'payment.failed' ||
      body.type === 'payment.refunded'
        ? body.type
        : 'ignored';
    return { type, providerRef: body.providerRef ?? '', raw: body };
  }
}
