/**
 * Usefulness Aggregation Cron Job
 * Runs periodic aggregation of usefulness scores
 */

import cron from 'node-cron';
import { Logger } from '@ainp/sdk';
import { UsefulnessAggregatorService } from '../services/usefulness-aggregator.js';
import { IncentiveDistributionService } from '../services/incentive-distribution.js';

const logger = new Logger({ serviceName: 'usefulness-aggregator-job' });

export function startUsefulnessAggregationJob(
  aggregator: UsefulnessAggregatorService,
  incentiveDistribution?: IncentiveDistributionService
) {
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

      // Phase 2B: Distribute usefulness rewards after aggregation
      if (incentiveDistribution) {
        const rewardPoolEnabled = process.env.USEFULNESS_REWARD_POOL_ENABLED === 'true';
        if (rewardPoolEnabled) {
          try {
            logger.info('[UsefulnessRewards] Starting credit distribution');

            // Reward pool size (default: 10000 credits = 10000000 atomic units)
            const rewardPoolAtomic = BigInt(
              process.env.USEFULNESS_REWARD_POOL_ATOMIC || '10000000'
            );
            const minScore = parseInt(process.env.USEFULNESS_MIN_SCORE_FOR_REWARDS || '10');

            const distributionStart = Date.now();
            const result = await incentiveDistribution.distributeUsefulnessRewards(
              rewardPoolAtomic,
              minScore
            );

            const distributionDuration = Date.now() - distributionStart;
            logger.info('[UsefulnessRewards] Distribution complete', {
              total_distributed: result.total_distributed.toString(),
              recipients_count: result.recipients.length,
              duration_ms: distributionDuration
            });
          } catch (distError) {
            logger.error('[UsefulnessRewards] Distribution failed', {
              error: distError instanceof Error ? distError.message : String(distError),
              stack: distError instanceof Error ? distError.stack : undefined
            });
          }
        } else {
          logger.debug('[UsefulnessRewards] Reward pool disabled (set USEFULNESS_REWARD_POOL_ENABLED=true to enable)');
        }
      }
    } catch (error) {
      logger.error('[UsefulnessAggregator] Aggregation job failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  logger.info(`[UsefulnessAggregator] Cron job scheduled (${schedule})`);
}
