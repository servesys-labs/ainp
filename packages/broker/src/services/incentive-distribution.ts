/**
 * IncentiveDistributionService - Phase 4.3
 *
 * Distributes credits according to incentive splits when negotiations complete.
 * Handles agent/broker/validator/pool allocation based on final proposal terms.
 *
 * Integration: Called by NegotiationService.settle() after work validation.
 */

import { DatabaseClient } from '../lib/db-client.js';
import { CreditService } from './credits.js';
import { IncentiveSplit } from '@ainp/core';
import { Logger } from '@ainp/sdk';

const logger = new Logger({ serviceName: 'incentive-distribution' });

export interface DistributionParams {
  intent_id: string;
  total_amount: bigint;
  agent_did: string;
  broker_did?: string;
  validator_did?: string;
  incentive_split: IncentiveSplit;
  usefulness_proof_id?: string;
}

export interface DistributionResult {
  intent_id: string;
  total_amount: bigint;
  distributed: {
    agent: bigint;
    broker: bigint;
    validator: bigint;
    pool: bigint;
  };
  recipients: {
    agent_did: string;
    broker_did?: string;
    validator_did?: string;
  };
}

export class IncentiveDistributionService {
  constructor(
    private db: DatabaseClient,
    private creditService: CreditService
  ) {}

  /**
   * Distribute credits according to incentive split
   * Called when negotiation completes successfully
   *
   * @param params - Distribution parameters (intent, amounts, DIDs, split)
   * @returns Distribution result with allocated amounts
   * @throws Error if split is invalid or credit operations fail
   */
  async distribute(params: DistributionParams): Promise<DistributionResult> {
    const {
      intent_id,
      total_amount,
      agent_did,
      broker_did,
      validator_did,
      incentive_split,
      usefulness_proof_id
    } = params;

    // Validate split totals 1.0
    const splitTotal = incentive_split.agent + incentive_split.broker +
                       incentive_split.validator + incentive_split.pool;

    if (Math.abs(splitTotal - 1.0) > 0.001) {
      throw new Error(`Invalid incentive split: totals ${splitTotal}, expected 1.0`);
    }

    // Calculate amounts (floor to avoid fractional atomic units)
    const agentAmount = BigInt(Math.floor(Number(total_amount) * incentive_split.agent));
    const brokerAmount = BigInt(Math.floor(Number(total_amount) * incentive_split.broker));
    const validatorAmount = BigInt(Math.floor(Number(total_amount) * incentive_split.validator));
    const poolAmount = total_amount - agentAmount - brokerAmount - validatorAmount; // Remainder

    // Distribute to agent (earn POU credits)
    await this.creditService.earn(agent_did, agentAmount, intent_id, usefulness_proof_id);

    logger.info('Credits distributed to agent', {
      intent_id,
      agent_did,
      amount: agentAmount.toString(),
      usefulness_proof_id
    });

    // Distribute to broker (if specified)
    if (broker_did && brokerAmount > 0n) {
      await this.creditService.earn(broker_did, brokerAmount, intent_id);
      logger.info('Credits distributed to broker', {
        intent_id,
        broker_did,
        amount: brokerAmount.toString()
      });
    }

    // Distribute to validator (if specified)
    if (validator_did && validatorAmount > 0n) {
      await this.creditService.earn(validator_did, validatorAmount, intent_id);
      logger.info('Credits distributed to validator', {
        intent_id,
        validator_did,
        amount: validatorAmount.toString()
      });
    }

    // Pool amount (TODO Phase 5: implement pool account)
    // For now, log it - future enhancement for global incentive pool
    if (poolAmount > 0n) {
      logger.info('Pool amount allocated (not yet implemented)', {
        intent_id,
        amount: poolAmount.toString()
      });
    }

    const result: DistributionResult = {
      intent_id,
      total_amount,
      distributed: {
        agent: agentAmount,
        broker: brokerAmount,
        validator: validatorAmount,
        pool: poolAmount
      },
      recipients: {
        agent_did,
        broker_did,
        validator_did
      }
    };

    logger.info('Incentive distribution complete', {
      intent_id,
      total_amount: total_amount.toString(),
      recipients: Object.keys(result.recipients).length
    });

    return result;
  }

  /**
   * Distribute credits based on usefulness scores (Phase 2B)
   * Rewards agents proportionally based on their contribution to the network
   *
   * Formula: credits_per_agent = (agent_score / total_score) * reward_pool
   *
   * @param rewardPool - Total credits to distribute (in atomic units)
   * @param minScore - Minimum usefulness score to qualify for rewards (default: 10)
   * @returns Distribution result with agent allocations
   */
  async distributeUsefulnessRewards(
    rewardPool: bigint,
    minScore: number = 10
  ): Promise<{
    total_distributed: bigint;
    recipients: Array<{ agent_did: string; amount: bigint; score: number }>;
  }> {
    // Get all agents with usefulness scores above threshold
    const agentsResult = await this.db.query(
      `SELECT did, usefulness_score_cached
       FROM agents
       WHERE usefulness_score_cached >= $1
       ORDER BY usefulness_score_cached DESC`,
      [minScore]
    );

    if (agentsResult.rows.length === 0) {
      logger.info('No agents qualify for usefulness rewards', { minScore });
      return { total_distributed: 0n, recipients: [] };
    }

    // Calculate total score
    const totalScore = agentsResult.rows.reduce(
      (sum: number, row: any) => sum + parseFloat(row.usefulness_score_cached || '0'),
      0
    );

    if (totalScore === 0) {
      logger.warn('Total usefulness score is zero, skipping distribution');
      return { total_distributed: 0n, recipients: [] };
    }

    // Distribute rewards proportionally
    const recipients: Array<{ agent_did: string; amount: bigint; score: number }> = [];
    let totalDistributed = 0n;

    for (const row of agentsResult.rows) {
      const agentScore = parseFloat(row.usefulness_score_cached || '0');
      const proportion = agentScore / totalScore;
      const amount = BigInt(Math.floor(Number(rewardPool) * proportion));

      if (amount > 0n) {
        // Award credits with usefulness_reward reference
        await this.creditService.earn(
          row.did,
          amount,
          'usefulness_reward'
          // No specific proof_id for aggregate rewards
        );

        recipients.push({
          agent_did: row.did,
          amount,
          score: agentScore
        });

        totalDistributed += amount;

        logger.info('Usefulness reward distributed', {
          agent_did: row.did,
          amount: amount.toString(),
          score: agentScore,
          proportion: (proportion * 100).toFixed(2) + '%'
        });
      }
    }

    logger.info('Usefulness rewards distribution complete', {
      reward_pool: rewardPool.toString(),
      total_distributed: totalDistributed.toString(),
      recipients_count: recipients.length,
      min_score: minScore
    });

    return { total_distributed: totalDistributed, recipients };
  }
}
