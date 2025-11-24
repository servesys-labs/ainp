/**
 * ReputationUpdater - EWMA updates from receipts to reputation vector and trust_scores
 */

import { DatabaseClient } from '../lib/db-client.js';

export class ReputationUpdater {
  constructor(private db: DatabaseClient, private alpha: number = 0.2) {}

  private clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

  async updateFromReceipt(agentDid: string, receipt: {
    metrics?: any;
    attestations?: Array<{ type: string; score?: number; confidence?: number }>;
  }): Promise<void> {
    // Map task data to dimensions
    const metrics = receipt.metrics || {};
    const atts = receipt.attestations || [];

    const accepted = atts.some(a => a.type === 'ACCEPTED');
    const auditPass = atts.filter(a => a.type === 'AUDIT_PASS');
    const safetyPass = atts.filter(a => a.type === 'SAFETY_PASS');

    // Quality (Q): acceptance + audit average
    const qScore = this.clamp01(
      (accepted ? 0.8 : 0.2) + (auditPass.length ? (auditPass.reduce((s,a)=> s + (a.score ?? 0.8),0) / auditPass.length) * 0.2 : 0)
    );

    // Timeliness (T): based on latency (normalize at 5s)
    const latency = Number(metrics.latency_ms ?? metrics.delivery_time ?? 5000);
    const tScore = this.clamp01(1 - (latency / 5000));

    // Reliability (R): bump on accepted
    const rScore = accepted ? 0.9 : 0.5;

    // Safety (S): from safety attestations if any, else neutral
    const sScore = safetyPass.length ? this.clamp01(safetyPass.reduce((s,a)=> s + (a.score ?? 0.9),0) / safetyPass.length) : 0.7;

    // Truthfulness (V): use audit as proxy
    const vScore = auditPass.length ? this.clamp01(auditPass.reduce((s,a)=> s + (a.confidence ?? 0.8),0) / auditPass.length) : 0.6;

    // Impact (I) and Efficiency (E) unknown at first -> stay near neutral,
    // Efficiency could use cost per token if available
    const iScore = 0.5;
    const eScore = 0.5;

    // Update agent_reputation via EWMA
    await this.db.query(
      `INSERT INTO agent_reputation (agent_id, q, t, r, s, v, i, e)
       SELECT id, $2, $3, $4, $5, $6, $7, $8 FROM agents WHERE did=$1
       ON CONFLICT (agent_id) DO UPDATE SET
         q = (1-$9)*agent_reputation.q + $9*$2,
         t = (1-$9)*agent_reputation.t + $9*$3,
         r = (1-$9)*agent_reputation.r + $9*$4,
         s = (1-$9)*agent_reputation.s + $9*$5,
         v = (1-$9)*agent_reputation.v + $9*$6,
         i = (1-$9)*agent_reputation.i + $9*$7,
         e = (1-$9)*agent_reputation.e + $9*$8,
         updated_at = NOW()`,
      [agentDid, qScore, tScore, rScore, sScore, vScore, iScore, eScore, this.alpha]
    );

    // Also update trust_scores for compatibility (reliability/timeliness weights)
    const trustReliability = rScore;
    const trustTimeliness = tScore;
    const trustHonesty = vScore; // reuse
    const trustCompetence = qScore; // reuse
    const aggregate = this.clamp01(
      trustReliability * 0.35 + trustHonesty * 0.35 + trustCompetence * 0.2 + trustTimeliness * 0.1
    );

    await this.db.query(
      `INSERT INTO trust_scores (agent_id, score, reliability, honesty, competence, timeliness, decay_rate, last_updated)
       SELECT id, $2, $3, $4, $5, $6, 0.977, NOW() FROM agents WHERE did=$1
       ON CONFLICT (agent_id) DO UPDATE SET
         score = $2,
         reliability = $3,
         honesty = $4,
         competence = $5,
         timeliness = $6,
         last_updated = NOW()`,
      [agentDid, aggregate, trustReliability, trustHonesty, trustCompetence, trustTimeliness]
    );
  }
}

