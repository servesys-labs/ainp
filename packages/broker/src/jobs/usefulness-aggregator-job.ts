/**
 * Usefulness Aggregation Cron Job
 * Runs periodic aggregation of usefulness scores
 */

import cron from 'node-cron';
import { Logger } from '@ainp/sdk';
import { UsefulnessAggregatorService } from '../services/usefulness-aggregator';

const logger = new Logger({ serviceName: 'usefulness-aggregator-job' });

export function startUsefulnessAggregationJob(aggregator: UsefulnessAggregatorService) {
  const enabled = process.env.USEFULNESS_AGGREGATION_ENABLED !== 'false';

  if (!enabled) {
    logger.info('[UsefulnessAggregator] Aggregation disabled via feature flag');
    return;
  }

  const intervalHours = parseInt(process.env.USEFULNESS_AGGREGATION_INTERVAL_HOURS || '1');

  // Cron schedule: every N hours (default: every hour at :00)
  const schedule = intervalHours === 1 ? '0 * * * *' : `0 */${intervalHours} * * *`;

  cron.schedule(schedule, async () => {
    try {
      logger.info('[UsefulnessAggregator] Starting aggregation job');
      const startTime = Date.now();

      const updateCount = await aggregator.updateCachedScores();

      const duration = Date.now() - startTime;
      logger.info(`[UsefulnessAggregator] Updated ${updateCount} agents in ${duration}ms`);
    } catch (error) {
      logger.error('[UsefulnessAggregator] Aggregation job failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  logger.info(`[UsefulnessAggregator] Cron job scheduled (${schedule})`);
}
