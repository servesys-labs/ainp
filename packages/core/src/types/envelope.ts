/**
 * AINP Envelope Type Definitions
 * Spec: RFC 001-SPEC Section 3.2
 */

import { AINPIntent } from './intent';

export interface AINPEnvelope {
  id: string;
  trace_id: string;
  from_did: string;
  to_did?: string;
  msg_type: 'INTENT' | 'RESULT' | 'ERROR' | 'NEGOTIATE' | 'ACK';
  ttl: number;
  timestamp: number;
  sig: string;
  payload: AINPIntent | ResultPayload | ErrorPayload | NegotiatePayload;
}

export interface ResultPayload {
  status: 'success' | 'partial' | 'failed';
  result: unknown;
  attestations?: string[];
  metadata?: Record<string, unknown>;

  // Web4 POU-lite integration
  usefulness_proof?: UsefulnessProof;  // Optional POU proof
}

export interface ErrorPayload {
  error_code: string;
  error_message: string;
  retry_after_ms?: number;
}

export interface NegotiatePayload {
  phase: 'OFFER' | 'COUNTER' | 'ACCEPT' | 'REJECT' | 'ABORT';
  proposal: Proposal;
  negotiation_id: string;
  round: number;
}

/**
 * Negotiation proposal with optional Web4 incentive split
 *
 * When incentive_split is provided, economic rewards will be distributed
 * according to the specified percentages after work completion.
 */
export interface Proposal {
  price: number;
  latency_ms: number;
  confidence: number;
  privacy?: string;
  terms?: Record<string, unknown>;

  // Web4 POU-lite integration
  incentive_split?: IncentiveSplit;  // Optional incentive distribution
}

/**
 * Web4 POU-lite: Economic incentive distribution
 */
export interface IncentiveSplit {
  agent: number;       // Percentage for agent doing the work
  broker: number;      // Percentage for broker/platform
  validator: number;   // Percentage for validators
  pool: number;        // Percentage for community pool
}

/**
 * Web4: Proof of Usefulness
 * Tracks productive work for economic incentives
 */
export interface UsefulnessProof {
  work_type: 'compute' | 'memory' | 'routing' | 'validation' | 'learning';
  metrics: WorkMetrics;
  attestations?: string[];  // VCs proving work completed
  trace_id: string;
  timestamp: number;
}

export interface WorkMetrics {
  compute_ms?: number;       // Computation time
  memory_bytes?: number;     // Memory allocated
  routing_hops?: number;     // Routing attempts
  validation_checks?: number; // Validation operations
  learning_samples?: number;  // Training samples processed
}

/**
 * Web4: Proof Submission Request (for POST /api/usefulness/proofs)
 */
export interface ProofSubmissionRequest {
  intent_id?: string;
  work_type: 'compute' | 'memory' | 'routing' | 'validation' | 'learning';
  metrics: WorkMetrics;
  attestations?: string[];
  trace_id: string;
  timestamp: number;
}

/**
 * Web4: Proof Submission Result
 */
export interface ProofSubmissionResult {
  id: string;
  usefulness_score: number;
  created_at: Date;
}

/**
 * Validation error for proof submission
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Calculate usefulness score from proof metrics
 * Default weights: compute 0.4, memory 0.3, routing 0.2, validation 0.1, learning 0.5
 */
export function calculateUsefulnessScore(proof: UsefulnessProof): number {
  const { work_type, metrics } = proof;

  let score = 0;

  switch (work_type) {
    case 'compute':
      score = Math.min(100, (metrics.compute_ms || 0) / 100); // 10s = 100 points
      break;
    case 'memory':
      score = Math.min(100, (metrics.memory_bytes || 0) / (1024 * 1024)); // 1MB = 1 point
      break;
    case 'routing':
      score = Math.min(100, (metrics.routing_hops || 0) * 10); // 1 hop = 10 points
      break;
    case 'validation':
      score = Math.min(100, (metrics.validation_checks || 0) * 5); // 1 check = 5 points
      break;
    case 'learning':
      score = Math.min(100, (metrics.learning_samples || 0) / 10); // 10 samples = 1 point
      break;
  }

  // Attestations boost score by 10%
  if (proof.attestations && proof.attestations.length > 0) {
    score *= 1.1;
  }

  return Math.min(100, Math.max(0, score));
}
