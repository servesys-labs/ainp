/**
 * NegotiationService - Multi-Round Negotiation Protocol
 * Phase 4.1: State machine for agent work coordination
 *
 * Implements the negotiation state machine:
 * initiated → proposed → counter_proposed → accepted|rejected|expired
 *
 * Features:
 * - Multi-round proposal/counter-proposal flow
 * - Convergence calculation (measures proposal similarity)
 * - State transition validation
 * - Automatic expiration handling
 * - Integration points for credit reservation (Phase 4.3)
 *
 * @see packages/db/migrations/004_add_negotiation_sessions.sql
 */

import { Logger } from '@ainp/sdk';
import { DatabaseClient } from '../lib/db-client';
import { CreditService } from './credits';
import { IncentiveDistributionService } from './incentive-distribution';
import {
  NegotiationSession,
  NegotiationState,
  NegotiationRound,
  ProposalTerms,
  InitiateNegotiationParams,
  CounterProposeParams,
  DEFAULT_INCENTIVE_SPLIT,
  NegotiationNotFoundError,
  InvalidStateTransitionError,
  ExpiredNegotiationError,
  MaxRoundsExceededError,
} from '@ainp/core';

const logger = new Logger({ serviceName: 'negotiation-service' });

/**
 * Feature flag for negotiation protocol
 */
// Note: This must be checked dynamically for test mocking
const isNegotiationEnabled = () => process.env.NEGOTIATION_ENABLED !== 'false';

/**
 * Default negotiation parameters
 */
const DEFAULT_MAX_ROUNDS = 10;
const DEFAULT_TTL_MINUTES = 60;
const MAX_ROUNDS_LIMIT = 20;

export class NegotiationService {
  constructor(
    private dbClient: DatabaseClient,
    private creditService: CreditService
  ) {}

  /**
   * Initiate a new negotiation session
   *
   * Creates a new negotiation in 'initiated' state with the initial proposal.
   * Sets expiration time based on TTL parameter.
   *
   * @param params - Negotiation parameters
   * @returns Newly created negotiation session
   * @throws Error if negotiation is disabled or participants are invalid
   */
  async initiate(params: InitiateNegotiationParams): Promise<NegotiationSession> {
    if (!isNegotiationEnabled()) {
      throw new Error('Negotiation protocol is disabled');
    }

    const {
      intent_id,
      initiator_did,
      responder_did,
      initial_proposal,
      max_rounds = DEFAULT_MAX_ROUNDS,
      ttl_minutes = DEFAULT_TTL_MINUTES,
    } = params;

    // Validate participants
    if (initiator_did === responder_did) {
      throw new Error('Initiator and responder must be different agents');
    }

    // Validate max_rounds
    if (max_rounds < 1 || max_rounds > MAX_ROUNDS_LIMIT) {
      throw new Error(`max_rounds must be between 1 and ${MAX_ROUNDS_LIMIT}`);
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + ttl_minutes * 60 * 1000);

    // Create initial round
    const initialRound: NegotiationRound = {
      round_number: 1,
      proposer_did: initiator_did,
      proposal: initial_proposal,
      timestamp: Date.now(),
    };

    // Use proposal's incentive split or default
    const incentiveSplit = initial_proposal.incentive_split || DEFAULT_INCENTIVE_SPLIT;

    // Use explicit transaction for INSERT
    const client = await this.dbClient.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
        INSERT INTO negotiations (
          intent_id,
          initiator_did,
          responder_did,
          state,
          rounds,
          convergence_score,
          current_proposal,
          incentive_split,
          max_rounds,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          intent_id,
          initiator_did,
          responder_did,
          'initiated',
          JSON.stringify([initialRound]),
          0.0, // Initial convergence is 0 (no previous proposal to compare)
          JSON.stringify(initial_proposal),
          JSON.stringify(incentiveSplit),
          max_rounds,
          expiresAt,
        ]
      );

      // Verify INSERT returned data
      if (!result.rows || result.rows.length === 0) {
        logger.error('Failed to persist negotiation session', {
          intent_id,
          initiator_did,
          responder_did
        });
        throw new Error('Failed to create negotiation session in database');
      }

      await client.query('COMMIT');

      const session = this.parseNegotiationRow(result.rows[0]);

      logger.info('Negotiation initiated', {
        negotiation_id: session.id,
        intent_id,
        initiator_did,
        responder_did,
        expires_at: expiresAt.toISOString(),
      });

      return session;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Propose or counter-propose in an existing negotiation
   *
   * Validates state transition, adds round to history, calculates convergence.
   * Updates state to 'proposed' or 'counter_proposed' based on current state.
   *
   * @param negotiationId - Negotiation session UUID
   * @param proposerDID - DID of agent making proposal
   * @param proposal - Proposal terms
   * @returns Updated negotiation session
   * @throws NegotiationNotFoundError if session doesn't exist
   * @throws ExpiredNegotiationError if session expired
   * @throws InvalidStateTransitionError if state transition invalid
   * @throws MaxRoundsExceededError if max rounds exceeded
   */
  async propose(
    negotiationId: string,
    proposerDID: string,
    proposal: ProposalTerms
  ): Promise<NegotiationSession> {
    const session = await this.getSession(negotiationId);
    if (!session) {
      logger.error('Negotiation not found for propose', {
        negotiation_id: negotiationId,
        proposer_did: proposerDID
      });
      throw new NegotiationNotFoundError(negotiationId);
    }

    // Check expiration
    if (new Date() >= session.expires_at) {
      throw new ExpiredNegotiationError(negotiationId, session.expires_at);
    }

    // Validate state transition
    const validStates: NegotiationState[] = ['initiated', 'proposed', 'counter_proposed'];
    if (!validStates.includes(session.state)) {
      throw new InvalidStateTransitionError(session.state, 'propose');
    }

    // Check max rounds
    const nextRoundNumber = session.rounds.length + 1;
    if (nextRoundNumber > session.max_rounds) {
      throw new MaxRoundsExceededError(negotiationId, session.max_rounds);
    }

    // Create new round
    const newRound: NegotiationRound = {
      round_number: nextRoundNumber,
      proposer_did: proposerDID,
      proposal,
      timestamp: Date.now(),
      convergence_delta: session.rounds.length > 0
        ? this.calculateProposalSimilarity(session.current_proposal!, proposal)
        : 0,
    };

    const updatedRounds = [...session.rounds, newRound];

    // Calculate convergence with ALL rounds (including new one)
    const convergenceScore = this.calculateConvergence(updatedRounds);

    // Determine next state based on current state and proposer
    let nextState: NegotiationState;
    if (session.state === 'initiated') {
      // First response from responder
      nextState = 'proposed';
    } else {
      // Subsequent counter-proposals
      nextState = 'counter_proposed';
    }

    // Update database
    const result = await this.dbClient.query(
      `
      UPDATE negotiations
      SET
        state = $1,
        rounds = $2,
        convergence_score = $3,
        current_proposal = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [
        nextState,
        JSON.stringify(updatedRounds),
        convergenceScore,
        JSON.stringify(proposal),
        negotiationId,
      ]
    );

    const updatedSession = this.parseNegotiationRow(result.rows[0]);

    logger.info('Negotiation proposal added', {
      negotiation_id: negotiationId,
      proposer_did: proposerDID,
      round_number: nextRoundNumber,
      state: nextState,
      convergence_score: convergenceScore,
    });

    return updatedSession;
  }

  /**
   * Accept the current proposal
   *
   * Finalizes the negotiation by setting state to 'accepted' and storing
   * the final proposal. In Phase 4.3, this will trigger credit reservation.
   *
   * @param negotiationId - Negotiation session UUID
   * @param acceptorDID - DID of agent accepting (must be participant)
   * @returns Updated negotiation session
   * @throws NegotiationNotFoundError if session doesn't exist
   * @throws ExpiredNegotiationError if session expired
   * @throws InvalidStateTransitionError if state transition invalid
   */
  async accept(negotiationId: string, acceptorDID: string): Promise<NegotiationSession> {
    const session = await this.getSession(negotiationId);
    if (!session) {
      throw new NegotiationNotFoundError(negotiationId);
    }

    // Check expiration
    if (new Date() >= session.expires_at) {
      throw new ExpiredNegotiationError(negotiationId, session.expires_at);
    }

    // Validate current_proposal exists (check before state validation per test expectations)
    if (!session.current_proposal) {
      throw new Error('Cannot accept: no current proposal to accept');
    }

    // Validate state transition
    const validStates: NegotiationState[] = ['proposed', 'counter_proposed'];
    if (!validStates.includes(session.state)) {
      throw new InvalidStateTransitionError(session.state, 'accept');
    }

    // Validate acceptor is a participant
    if (acceptorDID !== session.initiator_did && acceptorDID !== session.responder_did) {
      throw new Error(`Acceptor ${acceptorDID} is not a participant in this negotiation`);
    }

    // Phase 4.3: Reserve credits BEFORE updating database
    const enableCredits = process.env.CREDIT_LEDGER_ENABLED !== 'false';
    let priceInAtomicUnits: bigint | null = null;

    if (enableCredits && session.current_proposal?.price) {
      priceInAtomicUnits = BigInt(Math.floor(session.current_proposal.price * 1000));

      try {
        await this.creditService.reserve(
          session.initiator_did,
          priceInAtomicUnits,
          session.intent_id
        );

        logger.info('Credits reserved for negotiation', {
          negotiation_id: negotiationId,
          initiator_did: session.initiator_did,
          amount: priceInAtomicUnits.toString()
        });
      } catch (error) {
        throw new Error(`Credit reservation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update database with acceptance AND reserved credits in ONE query
    let result;
    if (priceInAtomicUnits !== null) {
      // Update with reserved credits (nested jsonb_set to create intermediate custom_terms)
      result = await this.dbClient.query(
        `
        UPDATE negotiations
        SET
          state = 'accepted',
          final_proposal = current_proposal,
          current_proposal = jsonb_set(
            jsonb_set(
              COALESCE(current_proposal, '{}'::jsonb),
              '{custom_terms}',
              '{}'::jsonb,
              true
            ),
            '{custom_terms,reserved_credits}',
            to_jsonb($2::text)
          ),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [negotiationId, priceInAtomicUnits.toString()]
      );
    } else {
      // Update without reserved credits
      result = await this.dbClient.query(
        `
        UPDATE negotiations
        SET
          state = 'accepted',
          final_proposal = current_proposal,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [negotiationId]
      );
    }

    const updatedSession = this.parseNegotiationRow(result.rows[0]);

    logger.info('Negotiation accepted', {
      negotiation_id: negotiationId,
      acceptor_did: acceptorDID,
      rounds: updatedSession.rounds.length,
      final_proposal: updatedSession.final_proposal,
      reserved_credits: priceInAtomicUnits?.toString(),
    });

    return updatedSession;
  }

  /**
   * Reject the negotiation
   *
   * Sets state to 'rejected' and optionally records rejection reason
   * in the rounds metadata.
   *
   * @param negotiationId - Negotiation session UUID
   * @param rejectorDID - DID of agent rejecting (must be participant)
   * @param reason - Optional rejection reason
   * @returns Updated negotiation session
   * @throws NegotiationNotFoundError if session doesn't exist
   */
  async reject(
    negotiationId: string,
    rejectorDID: string,
    reason?: string
  ): Promise<NegotiationSession> {
    const session = await this.getSession(negotiationId);
    if (!session) {
      throw new NegotiationNotFoundError(negotiationId);
    }

    // Validate rejector is a participant
    if (rejectorDID !== session.initiator_did && rejectorDID !== session.responder_did) {
      throw new Error(`Rejector ${rejectorDID} is not a participant in this negotiation`);
    }

    // Add rejection metadata to rounds
    const rejectionRound: NegotiationRound = {
      round_number: session.rounds.length + 1,
      proposer_did: rejectorDID,
      proposal: { custom_terms: { rejected: true, reason } },
      timestamp: Date.now(),
    };

    const updatedRounds = [...session.rounds, rejectionRound];

    // Update database
    const result = await this.dbClient.query(
      `
      UPDATE negotiations
      SET
        state = 'rejected',
        rounds = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [JSON.stringify(updatedRounds), negotiationId]
    );

    const updatedSession = this.parseNegotiationRow(result.rows[0]);

    logger.info('Negotiation rejected', {
      negotiation_id: negotiationId,
      rejector_did: rejectorDID,
      reason,
      rounds: updatedSession.rounds.length,
    });

    return updatedSession;
  }

  /**
   * Settle negotiation and distribute incentives
   *
   * Called after work is completed and validated. Releases reserved credits,
   * marks them as spent, and distributes incentives to participants according
   * to the negotiated incentive split.
   *
   * @param negotiationId - Negotiation session UUID
   * @param incentiveDistribution - IncentiveDistributionService instance
   * @param validatorDID - Optional validator DID (receives validator share)
   * @param usefulnessProofId - Optional usefulness proof ID for POU tracking
   * @throws NegotiationNotFoundError if session doesn't exist
   * @throws Error if negotiation not in 'accepted' state or no credits reserved
   */
  async settle(
    negotiationId: string,
    incentiveDistribution: IncentiveDistributionService,
    validatorDID?: string,
    usefulnessProofId?: string
  ): Promise<void> {
    const session = await this.getSession(negotiationId);

    if (!session) {
      throw new NegotiationNotFoundError(negotiationId);
    }

    if (session.state !== 'accepted') {
      throw new Error(`Cannot settle negotiation in state ${session.state}`);
    }

    const enableCredits = process.env.CREDIT_LEDGER_ENABLED !== 'false';

    if (!enableCredits) {
      logger.warn('Credit settlement skipped (CREDIT_LEDGER_ENABLED=false)', {
        negotiation_id: negotiationId
      });
      return;
    }

    // Get reserved amount from proposal custom_terms metadata
    const reservedAmount = session.current_proposal?.custom_terms?.reserved_credits
      ? BigInt(session.current_proposal.custom_terms.reserved_credits)
      : 0n;

    if (reservedAmount === 0n) {
      throw new Error('No credits reserved for this negotiation');
    }

    // Release reservation (mark all as spent)
    await this.creditService.release(
      session.initiator_did,
      reservedAmount,
      reservedAmount, // All reserved credits are spent
      session.intent_id
    );

    logger.info('Credits released from reservation', {
      negotiation_id: negotiationId,
      initiator_did: session.initiator_did,
      amount: reservedAmount.toString()
    });

    // Distribute to participants
    const result = await incentiveDistribution.distribute({
      intent_id: session.intent_id,
      total_amount: reservedAmount,
      agent_did: session.responder_did,
      broker_did: process.env.BROKER_DID,
      validator_did: validatorDID,
      incentive_split: session.incentive_split,
      usefulness_proof_id: usefulnessProofId
    });

    logger.info('Negotiation settled successfully', {
      negotiation_id: negotiationId,
      intent_id: session.intent_id,
      total_distributed: result.total_amount.toString(),
      agent_amount: result.distributed.agent.toString(),
      broker_amount: result.distributed.broker.toString(),
      validator_amount: result.distributed.validator.toString(),
      pool_amount: result.distributed.pool.toString()
    });
  }

  /**
   * Get negotiation session by ID
   *
   * @param negotiationId - Negotiation session UUID
   * @returns Negotiation session or null if not found
   */
  async getSession(negotiationId: string): Promise<NegotiationSession | null> {
    const result = await this.dbClient.query(
      `
      SELECT * FROM negotiations WHERE id = $1
      `,
      [negotiationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.parseNegotiationRow(result.rows[0]);
  }

  /**
   * Get all negotiation sessions for an agent (as initiator or responder)
   *
   * @param agentDID - Agent DID to filter by
   * @param state - Optional state filter
   * @returns Array of negotiation sessions
   */
  async getSessionsByAgent(
    agentDID: string,
    state?: NegotiationState
  ): Promise<NegotiationSession[]> {
    let query = `
      SELECT * FROM negotiations
      WHERE (initiator_did = $1 OR responder_did = $1)
    `;
    const params: any[] = [agentDID];

    if (state) {
      query += ` AND state = $2`;
      params.push(state);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.dbClient.query(query, params);

    return result.rows.map((row: any) => this.parseNegotiationRow(row));
  }

  /**
   * Calculate convergence score from negotiation rounds
   *
   * Measures how close the last two proposals are. Higher score means
   * proposals are converging toward agreement.
   *
   * Formula: Average similarity across all proposal terms (price, delivery_time, etc.)
   *
   * @param rounds - Negotiation rounds history
   * @returns Convergence score (0.0 - 1.0)
   */
  calculateConvergence(rounds: NegotiationRound[]): number {
    if (rounds.length < 2) {
      return 0.0; // Need at least 2 proposals to calculate convergence
    }

    const lastProposal = rounds[rounds.length - 1].proposal;
    const previousProposal = rounds[rounds.length - 2].proposal;

    return this.calculateProposalSimilarity(previousProposal, lastProposal);
  }

  /**
   * Calculate similarity between two proposals
   *
   * Compares each term and returns average similarity score.
   *
   * @param proposal1 - First proposal
   * @param proposal2 - Second proposal
   * @returns Similarity score (0.0 - 1.0)
   */
  private calculateProposalSimilarity(
    proposal1: ProposalTerms,
    proposal2: ProposalTerms
  ): number {
    const similarities: number[] = [];

    // Compare price (normalized by max value)
    if (proposal1.price !== undefined && proposal2.price !== undefined) {
      const maxPrice = Math.max(proposal1.price, proposal2.price);
      if (maxPrice > 0) {
        const priceSimilarity = 1.0 - Math.abs(proposal1.price - proposal2.price) / maxPrice;
        similarities.push(priceSimilarity);
      }
    }

    // Compare delivery_time (normalized by max value)
    if (proposal1.delivery_time !== undefined && proposal2.delivery_time !== undefined) {
      const maxTime = Math.max(proposal1.delivery_time, proposal2.delivery_time);
      if (maxTime > 0) {
        const timeSimilarity =
          1.0 - Math.abs(proposal1.delivery_time - proposal2.delivery_time) / maxTime;
        similarities.push(timeSimilarity);
      }
    }

    // Compare quality_sla (already 0-1 normalized)
    if (proposal1.quality_sla !== undefined && proposal2.quality_sla !== undefined) {
      const slaSimilarity = 1.0 - Math.abs(proposal1.quality_sla - proposal2.quality_sla);
      similarities.push(slaSimilarity);
    }

    // Compare incentive_split if both present
    if (proposal1.incentive_split && proposal2.incentive_split) {
      const split1 = proposal1.incentive_split;
      const split2 = proposal2.incentive_split;
      const splitSimilarity =
        1.0 -
        (Math.abs(split1.agent - split2.agent) +
          Math.abs(split1.broker - split2.broker) +
          Math.abs(split1.validator - split2.validator) +
          Math.abs(split1.pool - split2.pool)) /
          4;
      similarities.push(splitSimilarity);
    }

    // Return average similarity (or 0 if no comparable terms)
    return similarities.length > 0
      ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length
      : 0.0;
  }

  /**
   * Validate state transition is allowed
   *
   * Valid transitions:
   * - initiated → proposed (responder's first response)
   * - proposed → counter_proposed (subsequent rounds)
   * - counter_proposed → proposed (subsequent rounds)
   * - proposed/counter_proposed → accepted (either party accepts)
   * - any → rejected (either party rejects)
   * - any → expired (TTL reached)
   *
   * @param currentState - Current negotiation state
   * @param action - Action being attempted
   * @throws InvalidStateTransitionError if transition is invalid
   */
  validateStateTransition(currentState: NegotiationState, action: string): void {
    const validTransitions: Record<string, NegotiationState[]> = {
      propose: ['initiated', 'proposed', 'counter_proposed'],
      accept: ['proposed', 'counter_proposed'],
      reject: ['initiated', 'proposed', 'counter_proposed', 'accepted', 'rejected', 'expired'],
      expire: ['initiated', 'proposed', 'counter_proposed'],
    };

    const allowedStates = validTransitions[action];
    if (!allowedStates || !allowedStates.includes(currentState)) {
      throw new InvalidStateTransitionError(currentState, action);
    }
  }

  /**
   * Parse database row into NegotiationSession object
   *
   * Handles JSONB deserialization and type conversions.
   *
   * @param row - Database row
   * @returns Parsed negotiation session
   */
  private parseNegotiationRow(row: any): NegotiationSession {
    // Validate row parameter
    if (!row) {
      throw new Error('Cannot parse null or undefined database row');
    }

    return {
      id: row.id,
      intent_id: row.intent_id,
      initiator_did: row.initiator_did,
      responder_did: row.responder_did,
      state: row.state as NegotiationState,
      rounds: typeof row.rounds === 'string' ? JSON.parse(row.rounds) : row.rounds,
      convergence_score: parseFloat(row.convergence_score),
      current_proposal:
        typeof row.current_proposal === 'string'
          ? JSON.parse(row.current_proposal)
          : row.current_proposal,
      final_proposal:
        typeof row.final_proposal === 'string'
          ? JSON.parse(row.final_proposal)
          : row.final_proposal,
      incentive_split:
        typeof row.incentive_split === 'string'
          ? JSON.parse(row.incentive_split)
          : row.incentive_split,
      max_rounds: parseInt(row.max_rounds),
      created_at: new Date(row.created_at),
      expires_at: new Date(row.expires_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Expire stale negotiations (cron job)
   *
   * Calls the PostgreSQL function to mark expired negotiations.
   * Can be run periodically or manually.
   *
   * @returns Number of negotiations expired
   */
  async expireStaleNegotiations(): Promise<number> {
    const result = await this.dbClient.query(`SELECT expire_stale_negotiations() as count`);
    const count = result.rows[0].count;

    logger.info('Expired stale negotiations', { count });

    return count;
  }
}
