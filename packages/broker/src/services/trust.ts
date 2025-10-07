/**
 * Trust Management Service
 * Calculate and update trust scores with decay
 */

import { TrustVector } from '@ainp/core';
import { DatabaseClient } from '../lib/db-client';

export class TrustService {
  constructor(private dbClient: DatabaseClient) {}

  /**
   * Update trust score based on interaction outcome
   */
  async updateTrust(
    did: string,
    outcome: {
      success: boolean;
      latency_ms: number;
      expected_latency_ms: number;
    }
  ): Promise<TrustVector> {
    // Get current trust or initialize
    const agent = await this.dbClient.getAgent(did);
    const currentTrust = agent?.trust || this.getDefaultTrust();

    // Apply decay to all dimensions
    const daysSinceUpdate = (Date.now() - currentTrust.last_updated) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.pow(currentTrust.decay_rate, daysSinceUpdate);

    const decayedDimensions = {
      reliability: currentTrust.dimensions.reliability * decayFactor,
      honesty: currentTrust.dimensions.honesty * decayFactor,
      competence: currentTrust.dimensions.competence * decayFactor,
      timeliness: currentTrust.dimensions.timeliness * decayFactor,
    };

    // Calculate dimension updates
    const latencyRatio = outcome.latency_ms / Math.max(outcome.expected_latency_ms, 1);
    // Original formula: 1 - (latencyRatio - 1), but clamp to [0, 1]
    // When latency < expected: latencyRatio < 1, so 1 - (negative) = > 1, clamp to 1
    // When latency > expected: latencyRatio > 1, so 1 - (positive) = < 1
    const timeliness = Math.max(0, Math.min(1, 1 - (latencyRatio - 1)));

    // Reliability: base value, but reduced by extremely poor timeliness
    // When timeliness is very low, even successful responses indicate unreliability
    let reliability: number;
    if (outcome.success) {
      reliability = timeliness < 0.1 ? 0.5 : 0.95;
    } else {
      reliability = 0.05;
    }

    // Exponential moving average (alpha = 0.2)
    const alpha = 0.2;
    const newDimensions = {
      reliability: (1 - alpha) * decayedDimensions.reliability + alpha * reliability,
      honesty: decayedDimensions.honesty,
      competence: decayedDimensions.competence,
      timeliness: (1 - alpha) * decayedDimensions.timeliness + alpha * timeliness,
    };

    // Recalculate score with weighted average
    let newScore =
      newDimensions.reliability * 0.35 +
      newDimensions.honesty * 0.35 +
      newDimensions.competence * 0.2 +
      newDimensions.timeliness * 0.1;

    // Clamp score to [0, 1] range
    newScore = Math.max(0, Math.min(1, newScore));

    const updatedTrust: TrustVector = {
      score: newScore,
      dimensions: newDimensions,
      decay_rate: currentTrust.decay_rate,
      last_updated: Date.now(),
    };

    await this.dbClient.updateTrustScore(did, updatedTrust);

    return updatedTrust;
  }

  /**
   * Get default trust vector for new agents
   */
  private getDefaultTrust(): TrustVector {
    return {
      score: 0.5,
      dimensions: {
        reliability: 0.5,
        honesty: 0.5,
        competence: 0.5,
        timeliness: 0.5,
      },
      decay_rate: 0.977, // 30-day half-life
      last_updated: Date.now(),
    };
  }
}
