export type PaymentMethod = 'credit_card' | 'pix' | 'boleto';

export type CardDetails = {
  number: string;
  holder: string;
  expMonth: number;
  expYear: number;
  cvv: string;
  installments?: number;
};

export type ChargeInput = {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  customer: { email: string; name: string };
  card?: CardDetails;
};

export type ChargeResult = {
  providerRef: string;
  /** PAID = capturado agora. PENDING = aguardando o cliente (pix/boleto). */
  status: 'PAID' | 'PENDING' | 'FAILED';
  /** Dados que o front precisa exibir: QR code do pix, linha digitavel do boleto. */
  payload?: Record<string, unknown>;
  failureCode?: string;
  failureMessage?: string;
};

export type RefundResult = { refunded: boolean; providerRef: string };

export type WebhookEvent = {
  type: 'payment.paid' | 'payment.failed' | 'payment.refunded' | 'ignored';
  providerRef: string;
  raw?: unknown;
};

export interface PaymentProvider {
  readonly name: string;
  /** Metodos que este provedor aceita — o checkout usa isso para montar a UI. */
  readonly methods: readonly PaymentMethod[];
  charge(input: ChargeInput): Promise<ChargeResult>;
  refund(providerRef: string, amountCents: number): Promise<RefundResult>;
  parseWebhook(rawBody: Buffer | string, signature?: string): Promise<WebhookEvent>;
}
