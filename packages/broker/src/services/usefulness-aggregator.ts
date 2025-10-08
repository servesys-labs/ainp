/**
 * Usefulness Aggregator Service
 * Calculates rolling 30-day usefulness scores from usefulness_proofs table
 * Updates agents.usefulness_score_cached for discovery ranking
 */

import { DatabaseClient } from '../lib/db-client';
import { ProofSubmissionRequest, ProofSubmissionResult, ValidationError } from '@ainp/core';
import { isFeatureEnabled, FeatureFlag } from '../lib/feature-flags';

export interface UsefulnessAggregateResult {
  agent_did: string;
  usefulness_score: number; // 0-100
  total_proofs: number;
  work_type_breakdown: {
    compute: number;
    memory: number;
    routing: number;
    validation: number;
    learning: number;
  };
  last_proof_at: Date | null;
}

export class UsefulnessAggregatorService {
  constructor(private db: DatabaseClient) {}

  /**
   * Calculate 30-day rolling average usefulness scores for all agents
   */
  async aggregateScores(): Promise<UsefulnessAggregateResult[]> {
    const query = `
      SELECT
        a.did as agent_did,
        COALESCE(AVG(up.usefulness_score), 0) as usefulness_score,
        COUNT(up.id) as total_proofs,
        MAX(up.created_at) as last_proof_at,
        COALESCE(AVG(CASE WHEN up.work_type = 'compute' THEN up.usefulness_score END), 0) as compute_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'memory' THEN up.usefulness_score END), 0) as memory_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'routing' THEN up.usefulness_score END), 0) as routing_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'validation' THEN up.usefulness_score END), 0) as validation_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'learning' THEN up.usefulness_score END), 0) as learning_score
      FROM agents a
      LEFT JOIN usefulness_proofs up ON up.agent_did = a.did
        AND up.created_at > NOW() - INTERVAL '30 days'
      GROUP BY a.did
    `;

    const result = await this.db.query(query);

    return result.rows.map((row: any) => ({
      agent_did: row.agent_did,
      usefulness_score: Math.min(parseFloat(row.usefulness_score || '0'), 100),
      total_proofs: parseInt(row.total_proofs || '0'),
      work_type_breakdown: {
        compute: parseFloat(row.compute_score || '0'),
        memory: parseFloat(row.memory_score || '0'),
        routing: parseFloat(row.routing_score || '0'),
        validation: parseFloat(row.validation_score || '0'),
        learning: parseFloat(row.learning_score || '0'),
      },
      last_proof_at: row.last_proof_at ? new Date(row.last_proof_at) : null,
    }));
  }

  /**
   * Update agents.usefulness_score_cached for all agents
   */
  async updateCachedScores(): Promise<number> {
    const aggregates = await this.aggregateScores();

    let updateCount = 0;

    for (const agg of aggregates) {
      await this.db.query(
        `
        UPDATE agents
        SET
          usefulness_score_cached = $1,
          usefulness_last_updated = NOW()
        WHERE did = $2
      `,
        [agg.usefulness_score, agg.agent_did]
      );

      updateCount++;
    }

    return updateCount;
  }

  /**
   * Get aggregated score for specific agent (on-demand)
   */
  async getAgentScore(agentDID: string): Promise<UsefulnessAggregateResult | null> {
    const query = `
      SELECT
        a.did as agent_did,
        COALESCE(AVG(up.usefulness_score), 0) as usefulness_score,
        COUNT(up.id) as total_proofs,
        MAX(up.created_at) as last_proof_at,
        COALESCE(AVG(CASE WHEN up.work_type = 'compute' THEN up.usefulness_score END), 0) as compute_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'memory' THEN up.usefulness_score END), 0) as memory_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'routing' THEN up.usefulness_score END), 0) as routing_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'validation' THEN up.usefulness_score END), 0) as validation_score,
        COALESCE(AVG(CASE WHEN up.work_type = 'learning' THEN up.usefulness_score END), 0) as learning_score
      FROM agents a
      LEFT JOIN usefulness_proofs up ON up.agent_did = a.did
        AND up.created_at > NOW() - INTERVAL '30 days'
      WHERE a.did = $1
      GROUP BY a.did
    `;

    const result = await this.db.query(query, [agentDID]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    return {
      agent_did: row.agent_did,
      usefulness_score: Math.min(parseFloat(row.usefulness_score || '0'), 100),
      total_proofs: parseInt(row.total_proofs || '0'),
      work_type_breakdown: {
        compute: parseFloat(row.compute_score || '0'),
        memory: parseFloat(row.memory_score || '0'),
        routing: parseFloat(row.routing_score || '0'),
        validation: parseFloat(row.validation_score || '0'),
        learning: parseFloat(row.learning_score || '0'),
      },
      last_proof_at: row.last_proof_at ? new Date(row.last_proof_at) : null,
    };
  }

  /**
   * Submit proof of usefulness work (POST /api/usefulness/proofs)
   */
  async submitProof(
    agentDID: string,
    proof: ProofSubmissionRequest
  ): Promise<ProofSubmissionResult> {
    // Feature flag check
    if (!isFeatureEnabled(FeatureFlag.USEFULNESS_AGGREGATION_ENABLED)) {
      throw new Error('Usefulness aggregation is disabled');
    }

    // Validate agent exists
    const agentCheck = await this.db.query(
      'SELECT did FROM agents WHERE did = $1',
      [agentDID]
    );
    if (agentCheck.rows.length === 0) {
      throw new ValidationError(`Agent not found: ${agentDID}`);
    }

    // Calculate score
    const score = this.calculateScore(proof);

    // Insert proof
    const result = await this.db.query(
      `INSERT INTO usefulness_proofs (
        intent_id, agent_did, work_type, metrics,
        attestations, trace_id, usefulness_score, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, usefulness_score, created_at`,
      [
        proof.intent_id || null,
        agentDID,
        proof.work_type,
        JSON.stringify(proof.metrics),
        proof.attestations || null,
        proof.trace_id,
        score
      ]
    );

    return {
      id: result.rows[0].id,
      usefulness_score: parseFloat(result.rows[0].usefulness_score),
      created_at: result.rows[0].created_at
    };
  }

  private calculateScore(proof: ProofSubmissionRequest): number {
    const { work_type, metrics } = proof;
    let score = 0;

    switch (work_type) {
      case 'compute':
        score = Math.min(100, (metrics.compute_ms || 0) / 100);
        break;
      case 'memory':
        score = Math.min(100, (metrics.memory_bytes || 0) / (1024 * 1024));
        break;
      case 'routing':
        score = Math.min(100, (metrics.routing_hops || 0) * 10);
        break;
      case 'validation':
        score = Math.min(100, (metrics.validation_checks || 0) * 5);
        break;
      case 'learning':
        score = Math.min(100, (metrics.learning_samples || 0) / 10);
        break;
    }

    return Math.max(0, Math.min(100, score));
  }
}
