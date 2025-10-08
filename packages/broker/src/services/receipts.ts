/**
 * ReceiptService - Task receipts and attestations
 */

import { DatabaseClient } from '../lib/db-client';

export interface ReceiptParams {
  intent_id?: string;
  negotiation_id?: string;
  agent_did: string;
  client_did?: string;
  intent_type?: string;
  inputs_ref?: string;
  outputs_ref?: string;
  metrics?: Record<string, unknown>;
  payment_request_id?: string;
  amount_atomic?: bigint;
}

export interface Attestation {
  by_did: string;
  type: string;
  score?: number;
  confidence?: number;
  evidence_ref?: string;
  signature?: string;
}

export class ReceiptService {
  constructor(private db: DatabaseClient) {}

  async createReceipt(params: ReceiptParams): Promise<string> {
    const res = await this.db.query(
      `INSERT INTO task_receipts (
        intent_id, negotiation_id, agent_did, client_did, intent_type,
        inputs_ref, outputs_ref, metrics, payment_request_id, amount_atomic
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        params.intent_id || null,
        params.negotiation_id || null,
        params.agent_did,
        params.client_did || null,
        params.intent_type || null,
        params.inputs_ref || null,
        params.outputs_ref || null,
        JSON.stringify(params.metrics || {}),
        params.payment_request_id || null,
        params.amount_atomic ? params.amount_atomic.toString() : null,
      ]
    );
    return res.rows[0].id as string;
  }

  async addAttestations(task_id: string, attestations: Attestation[]): Promise<void> {
    for (const a of attestations) {
      await this.db.query(
        `INSERT INTO task_attestations (task_id, by_did, type, score, confidence, evidence_ref, signature)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          task_id,
          a.by_did,
          a.type,
          a.score ?? null,
          a.confidence ?? null,
          a.evidence_ref ?? null,
          a.signature ?? null,
        ]
      );
    }
  }

  async getReceipt(task_id: string): Promise<any | null> {
    const rec = await this.db.query(`SELECT * FROM task_receipts WHERE id=$1`, [task_id]);
    if (rec.rows.length === 0) return null;
    const atts = await this.db.query(`SELECT * FROM task_attestations WHERE task_id=$1 ORDER BY created_at ASC`, [task_id]);
    return { receipt: rec.rows[0], attestations: atts.rows };
  }
}

