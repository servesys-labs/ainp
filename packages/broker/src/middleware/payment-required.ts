/**
 * paymentRequiredMiddleware (scaffold)
 *
 * If caller has sufficient credits, spend and continue.
 * Otherwise, create a payment request and return 402 with a challenge.
 */

import { Request, Response, NextFunction } from 'express';
import { PaymentService, PaymentMethod } from '../services/payment';
import { CreditService } from '../services/credits';

export function paymentRequiredMiddleware(
  credits: CreditService,
  payments: PaymentService,
  options: { cost_atomic: bigint; method?: PaymentMethod; description?: string }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ownerDid = req.headers['x-ainp-did'] as string;
      if (!ownerDid) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing agent DID' });
      }

      // Check balance
      const account = await credits.getAccount(ownerDid);
      const balance = account?.balance ?? 0n;
      if (balance >= options.cost_atomic) {
        // Spend and proceed
        await credits.spend(ownerDid, options.cost_atomic, req.headers['x-idempotency-key'] as string || 'payable', 'payable');
        return next();
      }

      // Not enough balance: create payment request and return 402
      const challenge = await payments.createRequest({
        owner_did: ownerDid,
        amount_atomic: options.cost_atomic,
        method: options.method || 'coinbase',
        description: options.description || 'AINP payable endpoint',
        expires_in_seconds: 3600,
      });

      if (challenge.headers) {
        for (const [k, v] of Object.entries(challenge.headers)) res.setHeader(k, v);
      }
      if (challenge.payment_url) {
        res.setHeader('Link', `${challenge.payment_url}; rel="payment"`);
      }

      return res.status(402).json({
        error: 'PAYMENT_REQUIRED',
        request_id: challenge.request_id,
        amount_atomic: challenge.amount_atomic,
        method: challenge.method,
        provider: challenge.provider,
        payment_url: challenge.payment_url,
        expires_at: challenge.expires_at,
      });
    } catch (error) {
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  };
}

