/**
 * AINP Negotiation Type Definitions
 * Phase 4.1: Multi-Round Negotiation Protocol
 *
 * State machine for agent work coordination:
 * initiated → proposed → counter_proposed → accepted|rejected|expired
 *
 * @see packages/db/migrations/004_add_negotiation_sessions.sql
 */

import { IncentiveSplit } from './envelope';

/**
 * Negotiation state machine states
 */
export type NegotiationState =
  | 'initiated'         // Initial proposal sent by initiator
  | 'proposed'          // Counter-proposal from responder
  | 'counter_proposed'  // Further negotiation rounds
  | 'accepted'          // Final agreement reached
  | 'rejected'          // Negotiation failed
  | 'expired';          // Timeout exceeded (TTL reached)

/**
 * Single round of negotiation with proposal and metadata
 */
export interface NegotiationRound {
  round_number: number;           // Sequential round number (1-indexed)
  proposer_did: string;           // DID of agent making this proposal
  proposal: ProposalTerms;        // Proposal terms for this round
  timestamp: number;              // Unix timestamp (milliseconds)
  convergence_delta?: number;     // Similarity to previous proposal (0-1)
}

/**
 * Proposal terms that can be negotiated
 */
export interface ProposalTerms {
  price?: number;                           // Price in credits
  delivery_time?: number;                   // Expected delivery time (ms)
  quality_sla?: number;                     // Quality SLA score (0-1)
  incentive_split?: IncentiveSplit;         // Web4 POU-lite reward distribution
  custom_terms?: Record<string, any>;       // Extensible custom terms
}

/**
 * Complete negotiation session (database representation)
 */
export interface NegotiationSession {
  id: string;                               // UUID
  intent_id: string;                        // Related intent request (UUID)
  initiator_did: string;                    // Agent who initiated negotiation
  responder_did: string;                    // Agent responding to negotiation
  state: NegotiationState;                  // Current state
  rounds: NegotiationRound[];               // History of negotiation rounds
  convergence_score: number;                // Current convergence (0-1)
  current_proposal?: ProposalTerms;         // Latest proposal under consideration
  final_proposal?: ProposalTerms;           // Accepted proposal (when state='accepted')
  incentive_split: IncentiveSplit;          // Economic terms
  max_rounds: number;                       // Maximum allowed rounds (default: 10)
  created_at: Date;                         // Negotiation start time
  expires_at: Date;                         // Hard expiration deadline
  updated_at: Date;                         // Last modification time
}

/**
 * Parameters for initiating a new negotiation
 */
export interface InitiateNegotiationParams {
  intent_id: string;                        // Intent being negotiated
  initiator_did: string;                    // Requester DID
  responder_did: string;                    // Provider DID
  initial_proposal: ProposalTerms;          // Initial proposal terms
  max_rounds?: number;                      // Max rounds (default: 10, range: 1-20)
  ttl_minutes?: number;                     // Expiration TTL (default: 60 minutes)
}

/**
 * Parameters for counter-proposing in an existing negotiation
 */
export interface CounterProposeParams {
  negotiation_id: string;                   // Negotiation session UUID
  proposer_did: string;                     // DID of agent making counter-proposal
  counter_proposal: ProposalTerms;          // Counter-proposal terms
}

/**
 * Validate incentive split totals to 1.0 (100%)
 */
export function validateIncentiveSplit(split: IncentiveSplit): boolean {
  const total = split.agent + split.broker + split.validator + split.pool;
  return Math.abs(total - 1.0) < 0.0001; // Floating point tolerance
}

/**
 * Default incentive split (70% agent, 10% broker, 10% validator, 10% pool)
 * From Phase 3 spec: Web4 POU-lite integration
 */
export const DEFAULT_INCENTIVE_SPLIT: IncentiveSplit = {
  agent: 0.70,
  broker: 0.10,
  validator: 0.10,
  pool: 0.10
};

/**
 * Custom error types for negotiation operations
 */
export class NegotiationNotFoundError extends Error {
  constructor(negotiationId: string) {
    super(`Negotiation not found: ${negotiationId}`);
    this.name = 'NegotiationNotFoundError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(currentState: NegotiationState, action: string) {
    super(`Invalid state transition: cannot ${action} from state '${currentState}'`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class ExpiredNegotiationError extends Error {
  constructor(negotiationId: string, expiresAt: Date) {
    super(`Negotiation expired: ${negotiationId} (expired at ${expiresAt.toISOString()})`);
    this.name = 'ExpiredNegotiationError';
  }
}

export class MaxRoundsExceededError extends Error {
  constructor(negotiationId: string, maxRounds: number) {
    super(`Negotiation exceeded max rounds: ${negotiationId} (max: ${maxRounds})`);
    this.name = 'MaxRoundsExceededError';
  }
}

// Re-export IncentiveSplit from envelope for convenience
// This allows tests to import { IncentiveSplit } from '../types/negotiation'
export { type IncentiveSplit } from './envelope';
