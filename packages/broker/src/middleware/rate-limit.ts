/**
 * Rate Limiting Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { RedisClient } from '../lib/redis-client';

export function rateLimitMiddleware(redisClient: RedisClient, maxRequests: number = 100) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const did = req.headers['x-ainp-did'] as string;

    if (!did) {
      return res.status(400).json({ error: 'Missing X-AINP-DID header' });
    }

    const key = `ratelimit:${did}`;
    const count = await redisClient.incrementRateLimit(key, 60);

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
