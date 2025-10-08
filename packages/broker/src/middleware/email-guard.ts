/**
 * Email Guard Middleware
 * - Content dedupe window for EMAIL intents
 * - Optional postage spend for cold emails (first contact)
 */

import { Request, Response, NextFunction } from 'express';
import { AINPEnvelope } from '@ainp/core';
import { AntiFraudService } from '../services/anti-fraud';
import { CreditService } from '../services/credits';
import { isFeatureEnabled, FeatureFlag } from '../lib/feature-flags';

function isEmailIntent(envelope: AINPEnvelope): boolean {
  const payload: any = envelope?.payload;
  const t = payload?.['@type'];
  if (typeof t === 'string' && t.toUpperCase().includes('EMAIL')) return true;
  // Fallback: semantics.email === true
  const semantics: any = payload?.['semantics'];
  return semantics && semantics.email === true;
}

export function emailGuardMiddleware(
  antiFraud: AntiFraudService,
  credits: CreditService
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const envelope = req.body as AINPEnvelope;
    if (!envelope || envelope.msg_type !== 'INTENT' || !isEmailIntent(envelope)) {
      return next();
    }

    const fromDid = envelope.from_did;
    const toDid = envelope.to_did; // Only enforced for direct emails

    try {
      // Content dedupe (subject/body/headers in semantics)
      const payload: any = envelope.payload;
      const subject = payload?.semantics?.subject || '';
      const body = payload?.semantics?.body || '';
      const unique = await antiFraud.checkAndMarkContentHash(fromDid, toDid, subject, body);
      if (!unique) {
        return res.status(409).json({
          error: 'DUPLICATE_EMAIL',
          message: 'Duplicate email content detected within dedupe window',
        });
      }

      // Optional greylist for first contact (only on direct)
      if (toDid) {
        const greylist = await antiFraud.shouldGreylistFirstContact(fromDid, toDid);
        if (greylist) {
          // Ask sender to retry after delay
          const retry = parseInt(process.env.EMAIL_GREYLIST_DELAY_SECONDS || '300');
          res.setHeader('Retry-After', `${retry}`);
          return res.status(425).json({ // 425 Too Early as soft greylist
            error: 'GREYLISTED',
            message: `First-contact greylist in effect. Retry after ${retry}s.`
          });
        }
      }

      // Optional postage for cold email (direct only)
      if (toDid && isFeatureEnabled(FeatureFlag.EMAIL_POSTAGE_ENABLED)) {
        const atomic = BigInt(process.env.EMAIL_POSTAGE_AMOUNT_ATOMIC || '1000'); // default 1 credit
        // Spend postage immediately (economic friction)
        await credits.spend(fromDid, atomic, envelope.id, 'email_postage');
      }

      next();
    } catch (err: any) {
      return res.status(400).json({
        error: 'EMAIL_GUARD_ERROR',
        message: err?.message || String(err)
      });
    }
  };
}

