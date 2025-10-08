/**
 * CommitteeService
 *
 * Selects a committee of agents for PoU attestations.
 * Prototype: choose top-m by trust score, excluding specified DIDs.
 */

import { DatabaseClient } from '../lib/db-client';

export class CommitteeService {
  constructor(private db: DatabaseClient) {}

  async selectCommittee(options: { exclude?: string[]; m?: number }): Promise<string[]> {
    const exclude = options.exclude || [];
    const m = options.m ?? parseInt(process.env.POU_M || '5');
    // Fetch candidate agents ordered by trust score desc
    const res = await this.db.query(
      `SELECT a.did, COALESCE(ts.score, 0.5) AS w
       FROM agents a
       LEFT JOIN trust_scores ts ON ts.agent_id = a.id
       ORDER BY w DESC NULLS LAST
       LIMIT 200`
    );
    const out: string[] = [];
    for (const row of res.rows) {
      const did = row.did as string;
      if (exclude.includes(did)) continue;
      out.push(did);
      if (out.length >= m) break;
    }
    return out;
  }
}

