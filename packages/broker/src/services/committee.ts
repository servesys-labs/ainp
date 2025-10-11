/**
 * CommitteeService
 *
 * Selects a committee of agents for PoU attestations.
 * Prototype: choose top-m by trust score, excluding specified DIDs.
 */

import { DatabaseClient } from '../lib/db-client';

export class CommitteeService {
  constructor(private db: DatabaseClient) {}

  /**
   * Select a committee using weighted-random order (trust score * hash(seed, did))
   */
  async selectCommittee(options: { exclude?: string[]; m?: number; seed?: string }): Promise<string[]> {
    const exclude = options.exclude || [];
    const m = options.m ?? parseInt(process.env.POU_M || '5');
    const seed = options.seed || '';
    const res = await this.db.query(
      `SELECT a.did, COALESCE(ts.score, 0.5) AS w
       FROM agents a
       LEFT JOIN trust_scores ts ON ts.agent_id = a.id
       LIMIT 500`
    );
    // Compute score = w * rand where rand derived from hash(seed|did)
    const scored = res.rows
      .map((r: any) => ({ did: r.did as string, w: Number(r.w) }))
      .filter((r: { did: string; w: number }) => !exclude.includes(r.did))
      .map((r: { did: string; w: number }) => ({ did: r.did, s: r.w * this.rand(seed, r.did) }))
      .sort((a: { s: number }, b: { s: number }) => b.s - a.s)
      .slice(0, m)
      .map((r: { did: string }) => r.did);
    return scored;
  }

  private rand(seed: string, did: string): number {
    const str = seed + '|' + did;
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    // Convert to [0,1)
    return ((h >>> 0) % 10000) / 10000;
  }
}
