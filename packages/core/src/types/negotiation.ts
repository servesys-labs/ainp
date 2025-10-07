/**
 * AINP Negotiation Type Definitions
 * Spec: RFC 001-SPEC Section 4
 */

import { Proposal } from './envelope';

export interface NegotiationConstraints {
  max_rounds: number;
  timeout_per_round_ms: number;
  convergence_threshold: number;
}

export interface NegotiationState {
  negotiation_id: string;
  phase: 'OFFER' | 'COUNTER' | 'ACCEPT' | 'REJECT' | 'ABORT';
  round: number;
  proposal: Proposal;
  constraints: NegotiationConstraints;
}
