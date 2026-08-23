import { env } from '../env.js';
import { MockPaymentProvider } from './mock.js';
import { StripePaymentProvider } from './stripe.js';
import type { PaymentProvider } from './types.js';

let provider: PaymentProvider;

export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  if (env.PAYMENT_PROVIDER === 'stripe' && env.STRIPE_SECRET_KEY) {
    provider = new StripePaymentProvider();
  } else {
    provider = new MockPaymentProvider();
  }
  return provider;
}

export * from './types.js';
