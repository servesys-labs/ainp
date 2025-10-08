/**
 * LightningDriver (L402 scaffold)
 *
 * Generates a placeholder invoice and deep link. Replace with a real Lightning node
 * or service (e.g., LND/CLN) and expose LNURL/WebLN flows as needed.
 */

import type { PaymentProvider, PaymentRequestRecord, ProviderCreateResponse } from '../payment';

export class LightningDriver implements PaymentProvider {
  constructor(private endpoint?: string, private apiKey?: string) {}

  async createPayment(req: PaymentRequestRecord): Promise<ProviderCreateResponse> {
    // TODO: call lightning node/service to create an invoice for req.amount_atomic
    const invoice = `lnbc${req.amount_atomic.toString()}n1p${req.id.replace(/-/g, '')}`;
    const deepLink = `lightning:${invoice}`;
    return {
      provider: 'lightning',
      provider_id: req.id,
      payment_url: deepLink, // clients can open in mobile wallet
      metadata: { invoice },
      expires_at: req.expires_at,
    };
  }

  async verifyWebhook(signature: string | undefined, payload: string) {
    // TODO: verify with your lightning service
    const raw = JSON.parse(payload);
    const request_id = raw?.request_id || raw?.data?.request_id || 'unknown';
    const tx_ref = raw?.preimage || raw?.payment_hash || 'ln_paid';
    const amount_atomic = BigInt(raw?.amount_atomic || 0);
    return { request_id, tx_ref, amount_atomic, provider: 'lightning', raw };
  }
}

