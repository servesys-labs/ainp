/**
 * SlashingService (prototype)
 *
 * Reduces an agent's stake and applies a reputation penalty.
 */

import { DatabaseClient } from '../lib/db-client.js';

export class SlashingService {
  constructor(private db: DatabaseClient) {}

  async slash(agentDid: string, amountAtomic: bigint, reason?: string): Promise<void> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      // Upsert stake and reduce locked amount
      await client.query(
        `INSERT INTO agent_stakes (agent_id, amount_locked, slashed_total)
         SELECT id, GREATEST(0, 0 - $2::bigint), $2 FROM agents WHERE did=$1
         ON CONFLICT (agent_id) DO UPDATE SET
           amount_locked = GREATEST(0, agent_stakes.amount_locked - $2::bigint),
           slashed_total = agent_stakes.slashed_total + $2::bigint,
           updated_at = NOW()`,
        [agentDid, amountAtomic.toString()]
      );

      // Apply a small penalty to trust_scores and agent_reputation
      const penalty = 0.1; // reduce 10%
      await client.query(
        `UPDATE trust_scores SET
           score = GREATEST(0, score * (1 - $2)),
           reliability = GREATEST(0, reliability * (1 - $2)),
           honesty = GREATEST(0, honesty * (1 - $2)),
           competence = GREATEST(0, competence * (1 - $2)),
           timeliness = GREATEST(0, timeliness * (1 - $2)),
           last_updated = NOW()
         WHERE agent_id = (SELECT id FROM agents WHERE did=$1)`,
        [agentDid, penalty]
      );

      await client.query(
        `UPDATE agent_reputation SET
           q = GREATEST(0, q * (1 - $2)),
           t = GREATEST(0, t * (1 - $2)),
           r = GREATEST(0, r * (1 - $2)),
           s = GREATEST(0, s * (1 - $2)),
           v = GREATEST(0, v * (1 - $2)),
           i = GREATEST(0, i * (1 - $2)),
           e = GREATEST(0, e * (1 - $2)),
           updated_at = NOW()
         WHERE agent_id = (SELECT id FROM agents WHERE did=$1)`,
        [agentDid, penalty]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

