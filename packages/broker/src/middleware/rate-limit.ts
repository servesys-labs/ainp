/**
 * Rate Limiting Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { RedisClient } from '../lib/redis-client';

export function rateLimitMiddleware(
  redisClient: RedisClient,
  maxRequests: number = 100,
  requireDID: boolean = true
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Try DID-based rate limiting first
    const did = req.headers['x-ainp-did'] as string;

    let rateLimitKey: string;

    if (did) {
      // DID-based rate limiting (preferred for authenticated requests)
      rateLimitKey = `ratelimit:did:${did}`;
    } else if (requireDID) {
      // DID is required but missing
      return res.status(400).json({ error: 'Missing X-AINP-DID header' });
    } else {
      // Fall back to IP-based rate limiting for public endpoints
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      rateLimitKey = `ratelimit:ip:${ip}`;
    }

    const count = await redisClient.incrementRateLimit(rateLimitKey, 60);

    // Handle degraded mode (Redis unavailable)
    if (count === -1) {
      console.warn('[RateLimit] Redis unavailable - allowing request');
      res.setHeader('X-RateLimit-Degraded', 'true');
      return next();
    }

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));

    if (count > maxRequests) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        retry_after_ms: 60000,
      });
    }

    next();
  };
}
