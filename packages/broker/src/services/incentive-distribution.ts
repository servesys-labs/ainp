/**
 * IncentiveDistributionService - Phase 4.3
 *
 * Distributes credits according to incentive splits when negotiations complete.
 * Handles agent/broker/validator/pool allocation based on final proposal terms.
 *
 * Integration: Called by NegotiationService.settle() after work validation.
 */

import { DatabaseClient } from '../lib/db-client';
import { CreditService } from './credits';
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
}
