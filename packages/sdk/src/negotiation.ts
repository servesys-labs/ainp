/**
 * AINP Negotiation Logic
 * Multi-round negotiation with convergence detection
 * Spec: RFC 001-SPEC Section 4
 */

import { NegotiationConstraints, Proposal } from '@ainp/core';
import { NegotiationError } from './errors';
import { Logger } from './logger';

const logger = new Logger({ serviceName: 'ainp-negotiation' });

export interface NegotiationResult {
  phase: 'ACCEPT' | 'REJECT' | 'ABORT';
  proposal: Proposal | null;
  round: number;
}

/**
 * Calculate convergence score between two proposals
 * @param current - Current proposal
 * @param previous - Previous proposal
 * @returns Convergence score (0-1), 1 = identical
 */
export function calculateConvergence(current: Proposal, previous: Proposal): number {
  const priceConvergence =
    1 - Math.abs(current.price - previous.price) / Math.max(current.price, previous.price);

  const latencyConvergence =
    1 -
    Math.abs(current.latency_ms - previous.latency_ms) /
      Math.max(current.latency_ms, previous.latency_ms);

  const confidenceConvergence =
    1 -
    Math.abs(current.confidence - previous.confidence) /
      Math.max(current.confidence, previous.confidence);

  // Weighted average (price and latency are more important)
  const convergence =
    priceConvergence * 0.4 + latencyConvergence * 0.4 + confidenceConvergence * 0.2;

  logger.debug('Calculated convergence', {
    priceConvergence,
    latencyConvergence,
    confidenceConvergence,
    totalConvergence: convergence,
  });

  return convergence;
}

/**
 * Generate counter-proposal based on convergence strategy
 * @param offer - Received offer
 * @param target - Our target proposal
 * @param round - Current negotiation round
 * @param maxRounds - Maximum rounds allowed
 * @returns Counter-proposal
 */
export function generateCounterProposal(
  offer: Proposal,
  target: Proposal,
  round: number,
  maxRounds: number
): Proposal {
  // Progressive convergence: move closer to midpoint each round
  const progress = round / maxRounds;
  const weight = 0.5 + progress * 0.3; // Start at 50-50, move to 80-20

  const counterPrice = offer.price * (1 - weight) + target.price * weight;
  const counterLatency = offer.latency_ms * (1 - weight) + target.latency_ms * weight;
  const counterConfidence = offer.confidence * (1 - weight) + target.confidence * weight;

  const counterProposal: Proposal = {
    price: Math.round(counterPrice * 100) / 100, // Round to 2 decimals
    latency_ms: Math.round(counterLatency),
    confidence: Math.round(counterConfidence * 100) / 100,
    privacy: offer.privacy || target.privacy,
    terms: { ...target.terms, ...offer.terms }, // Merge terms
  };

  logger.debug('Generated counter-proposal', {
    round,
    weight,
    offer,
    target,
    counterProposal,
  });

  return counterProposal;
}

/**
 * Evaluate if a proposal meets our constraints
 * @param proposal - Proposal to evaluate
 * @param target - Our target proposal
 * @param threshold - Acceptable deviation threshold (0-1)
 * @returns true if acceptable
 */
export function evaluateProposal(
  proposal: Proposal,
  target: Proposal,
  threshold: number = 0.2
): boolean {
  const priceDeviation = Math.abs(proposal.price - target.price) / target.price;
  const latencyDeviation =
    Math.abs(proposal.latency_ms - target.latency_ms) / target.latency_ms;
  const confidenceDeviation =
    Math.abs(proposal.confidence - target.confidence) / target.confidence;

  const acceptable =
    priceDeviation <= threshold &&
    latencyDeviation <= threshold &&
    confidenceDeviation <= threshold;

  logger.debug('Evaluated proposal', {
    priceDeviation,
    latencyDeviation,
    confidenceDeviation,
    threshold,
    acceptable,
  });

  return acceptable;
}

/**
 * Execute negotiation round
 * @param offer - Received offer
 * @param target - Our target proposal
 * @param round - Current round number
 * @param constraints - Negotiation constraints
 * @param previousProposal - Previous proposal (for convergence)
 * @returns Negotiation result
 */
export function executeNegotiationRound(
  offer: Proposal,
  target: Proposal,
  round: number,
  constraints: NegotiationConstraints,
  previousProposal?: Proposal
): NegotiationResult {
  // Check max rounds
  if (round >= constraints.max_rounds) {
    logger.warn('Negotiation aborted: max rounds exceeded', {
      round,
      maxRounds: constraints.max_rounds,
    });
    return { phase: 'ABORT', proposal: null, round };
  }

  // Check if offer is acceptable
  if (evaluateProposal(offer, target, 1 - constraints.convergence_threshold)) {
    logger.info('Negotiation accepted', { round, offer });
    return { phase: 'ACCEPT', proposal: offer, round };
  }

  // Check convergence with previous round
  if (previousProposal) {
    const convergence = calculateConvergence(offer, previousProposal);
    if (convergence >= constraints.convergence_threshold) {
      logger.info('Negotiation accepted: convergence threshold met', {
        round,
        convergence,
        threshold: constraints.convergence_threshold,
      });
      return { phase: 'ACCEPT', proposal: offer, round };
    }
  }

  // Generate counter-proposal
  const counterProposal = generateCounterProposal(
    offer,
    target,
    round,
    constraints.max_rounds
  );

  logger.info('Negotiation continues', { round, counterProposal });

  return { phase: 'REJECT', proposal: counterProposal, round };
}
