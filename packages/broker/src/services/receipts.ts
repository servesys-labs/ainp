/**
 * ReceiptService - Task receipts and attestations
 */

import { DatabaseClient } from '../lib/db-client';
import { CommitteeService } from './committee';
import { extractPublicKey } from '@ainp/sdk';
import { canonicalize } from 'json-canonicalize';
import { verify as nodeVerify } from 'crypto';

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
  constructor(private db: DatabaseClient, private committee?: CommitteeService) {}

  async createReceipt(params: ReceiptParams & { k?: number; m?: number }): Promise<string> {
    const res = await this.db.query(
      `INSERT INTO task_receipts (
        intent_id, negotiation_id, agent_did, client_did, intent_type,
        inputs_ref, outputs_ref, metrics, payment_request_id, amount_atomic,
        k, m, committee
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
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
        params.k ?? parseInt(process.env.POU_K || '3'),
        params.m ?? parseInt(process.env.POU_M || '5'),
        JSON.stringify(await this.selectCommittee(params)),
      ]
    );
    return res.rows[0].id as string;
  }

  async addAttestations(task_id: string, attestations: Attestation[]): Promise<void> {
    // Load receipt context
    const recRes = await this.db.query(`SELECT client_did, committee FROM task_receipts WHERE id=$1`, [task_id]);
    if (recRes.rows.length === 0) throw new Error('RECEIPT_NOT_FOUND');
    const clientDid = recRes.rows[0].client_did as string | null;
    const committee: string[] = Array.isArray(recRes.rows[0].committee) ? recRes.rows[0].committee : [];

    for (const a of attestations) {
      // Validation rules:
      // - ACCEPTED may be submitted by client_did (if present)
      // - AUDIT_PASS must be submitted by a committee member (if committee is populated)
      if (a.type === 'ACCEPTED' && clientDid && a.by_did !== clientDid) {
        throw new Error('UNAUTHORIZED_ATTESTATION: ACCEPTED must be by client_did');
      }
      if (a.type === 'AUDIT_PASS' && committee.length > 0 && !committee.includes(a.by_did)) {
        throw new Error('UNAUTHORIZED_ATTESTATION: AUDIT_PASS must be by committee member');
      }

      // Verify signature if provided
      if (a.signature) {
        const ok = await this.verifyAttestationSignature(task_id, a);
        if (!ok) throw new Error('INVALID_SIGNATURE');
      }

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

  /**
   * Verify attestation signature using Ed25519 (Node crypto) and did:key
   * Canonicalized payload: {task_id, by_did, type, score, confidence, evidence_ref}
   */
  private async verifyAttestationSignature(task_id: string, a: Attestation): Promise<boolean> {
    try {
      const payload = canonicalize({
        task_id,
        by_did: a.by_did,
        type: a.type,
        score: a.score ?? null,
        confidence: a.confidence ?? null,
        evidence_ref: a.evidence_ref ?? null,
      });
      // Resolve public key from DID (raw 32 bytes)
      const raw = extractPublicKey(a.by_did);
      // Convert raw Ed25519 key to SPKI DER (Node requirement)
      const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
      const spkiDer = Buffer.concat([SPKI_PREFIX, raw]);
      const sig = Buffer.from(a.signature as string, 'base64');
      return nodeVerify(null, Buffer.from(payload, 'utf8'), { key: spkiDer, format: 'der', type: 'spki' }, sig);
    } catch (_e) {
      return false;
    }
  }

  async getCommittee(task_id: string): Promise<string[]> {
    const res = await this.db.query(`SELECT committee FROM task_receipts WHERE id=$1`, [task_id]);
    if (res.rows.length === 0) throw new Error('RECEIPT_NOT_FOUND');
    const committee = res.rows[0].committee;
    return Array.isArray(committee) ? committee : [];
  }

  private async selectCommittee(params: ReceiptParams & { m?: number }): Promise<string[]> {
    if (!this.committee) return [];
    const m = params.m ?? parseInt(process.env.POU_M || '5');
    const exclude: string[] = [];
    if (params.agent_did) exclude.push(params.agent_did);
    if (params.client_did) exclude.push(params.client_did);
    return await this.committee.selectCommittee({ exclude, m });
  }

  async getReceipt(task_id: string): Promise<any | null> {
    const rec = await this.db.query(`SELECT * FROM task_receipts WHERE id=$1`, [task_id]);
    if (rec.rows.length === 0) return null;
    const atts = await this.db.query(`SELECT * FROM task_attestations WHERE task_id=$1 ORDER BY created_at ASC`, [task_id]);
    return { receipt: rec.rows[0], attestations: atts.rows };
  }
}
