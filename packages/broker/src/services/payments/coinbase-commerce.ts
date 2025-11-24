/**
 * CoinbaseCommerceDriver (scaffold)
 *
 * Minimal driver stub for Coinbase Commerce integration.
 * This scaffold does not call the real API; fill in HTTP calls as needed.
 */

import type { PaymentProvider, PaymentRequestRecord, ProviderCreateResponse } from '../payment.js';

export class CoinbaseCommerceDriver implements PaymentProvider {
  constructor(private apiKey?: string, private webhookSecret?: string) {}

  async createPayment(req: PaymentRequestRecord): Promise<ProviderCreateResponse> {
    // TODO: Call Coinbase Commerce to create a charge, return hosted_url and charge id
    // For scaffold, return a dummy URL with the request id embedded
    const url = `${process.env.PUBLIC_BASE_URL || 'http://localhost:8080'}/pay/invoices/${req.id}`;
    return {
      provider: 'coinbase',
      provider_id: `dummy_${req.id}`,
      payment_url: url,
      expires_at: req.expires_at,
      metadata: { note: 'scaffold: replace with Coinbase Commerce charge' }
    };
  }

  async verifyWebhook(signature: string | undefined, payload: string): Promise<{ request_id: string; tx_ref: string; amount_atomic: bigint; provider: string; raw: any; }>{
    // TODO: Verify Coinbase webhook signature using this.webhookSecret
    // Parse payload and extract request_id (from metadata), tx_ref, and amount
    const raw = JSON.parse(payload);
    const request_id = raw?.data?.metadata?.request_id || raw?.request_id || raw?.data?.id || 'unknown';
    const tx_ref = raw?.event?.id || raw?.data?.id || 'unknown_tx';
    const amount_atomic = BigInt(raw?.data?.pricing?.local?.amount ? Math.floor(Number(raw.data.pricing.local.amount) * (Number(process.env.ATOMIC_PER_UNIT || '1000'))) : 0);
    return { request_id, tx_ref, amount_atomic, provider: 'coinbase', raw };
  }
}

