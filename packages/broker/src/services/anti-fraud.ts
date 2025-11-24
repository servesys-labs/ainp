/**
 * AntiFraudService
 * Lightweight anti-fraud utilities using Redis for replay, dedupe, and greylist tracking.
 */

import { createHash } from 'crypto';
import { RedisClient } from '../lib/redis-client.js';
import { isFeatureEnabled, FeatureFlag } from '../lib/feature-flags.js';
import { Logger } from '@ainp/sdk';

const logger = new Logger({ serviceName: 'anti-fraud' });

export class AntiFraudService {
  constructor(private redis: RedisClient) {}

  /**
   * Replay protection: mark an id (envelope.id or {from,trace_id}) as used within TTL.
   * Returns true if the id was newly stored, false if replay detected.
   */
  async checkAndMarkReplay(key: string, ttlSeconds: number = 300): Promise<boolean> {
    if (!isFeatureEnabled(FeatureFlag.REPLAY_PROTECTION_ENABLED)) return true;
    try {
      // Use SET NX with expiry semantics: emulate with setEx on first write
      const exists = await this.redis.getCachedDiscoveryResult<string>(`replay:${key}`);
      if (exists) return false;
      await this.redis.cacheDiscoveryResult(`replay:${key}`, '1', ttlSeconds);
      return true;
    } catch (err) {
      logger.warn('Replay check degraded (Redis error)', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Degrade open (do not block if Redis unavailable)
      return true;
    }
  }

  /**
   * Content dedupe (email): prevent repeated identical messages within window.
   * Returns true if content is new, false if duplicate within dedupe window.
   */
  async checkAndMarkContentHash(
    fromDid: string,
    toDid: string | undefined,
    subject: string,
    body: string,
    windowSeconds: number = parseInt(process.env.EMAIL_DEDUPE_TTL_SECONDS || '86400')
  ): Promise<boolean> {
    if (!isFeatureEnabled(FeatureFlag.EMAIL_CONTENT_DEDUPE_ENABLED)) return true;

    const h = createHash('sha256')
      .update(fromDid)
      .update('|')
      .update(toDid || '*')
      .update('|')
      .update(subject || '')
      .update('|')
      .update(body || '')
      .digest('hex');
    const key = `email:dedupe:${h}`;

    try {
      const exists = await this.redis.getCachedDiscoveryResult<string>(key);
      if (exists) return false;
      await this.redis.cacheDiscoveryResult(key, '1', windowSeconds);
      return true;
    } catch (err) {
      logger.warn('Content dedupe degraded (Redis error)', {
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
  }

  /**
   * Greylist first contact between two DIDs, returning whether delivery should be delayed.
   * Returns true if should delay (greylist applied), false if allowed immediately.
   */
  async shouldGreylistFirstContact(
    fromDid: string,
    toDid: string,
  ): Promise<boolean> {
    if (!isFeatureEnabled(FeatureFlag.EMAIL_GREYLIST_ENABLED)) return false;
    try {
      const key = `email:contact:${fromDid}->${toDid}`;
      const seen = await this.redis.getCachedDiscoveryResult<string>(key);
      if (seen) return false; // already seen
      // Mark as seen for future immediate delivery
      const delay = parseInt(process.env.EMAIL_GREYLIST_DELAY_SECONDS || '300');
      await this.redis.cacheDiscoveryResult(key, '1', delay);
      return true;
    } catch (err) {
      logger.warn('Greylist degraded (Redis error)', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}

