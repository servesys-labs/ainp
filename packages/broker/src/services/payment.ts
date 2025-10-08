/**
 * PaymentService
 *
 * Orchestrates creation and fulfillment of payment requests for account top-ups
 * and payable endpoints. Persists requests/receipts and credits the internal
 * ledger upon confirmed payment.
 */

import { DatabaseClient } from '../lib/db-client';
import { CreditService } from './credits';

export type PaymentMethod = 'credits' | 'coinbase' | 'lightning' | 'usdc';
export type PaymentStatus = 'created' | 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled';

export interface CreatePaymentParams {
  owner_did: string;
  amount_atomic: bigint;      // 1000 = 1 credit
  currency?: string;          // default 'credits'
  method: PaymentMethod;
  description?: string;
  expires_in_seconds?: number;
}

export interface PaymentRequestRecord {
  id: string;
  owner_did: string;
  amount_atomic: bigint;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider?: string;
  provider_id?: string;
  provider_metadata?: Record<string, unknown>;
  description?: string;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentChallenge {
  request_id: string;
  amount_atomic: string; // bigint as string for JSON
  currency: string;
  method: PaymentMethod;
  provider?: string;
  payment_url?: string;
  payment_qr?: string;
  provider_id?: string;
  expires_at?: string;
  headers?: Record<string, string>; // Suggested auth headers (WWW-Authenticate, Link)
  metadata?: Record<string, unknown>;
}

export interface ProviderCreateResponse {
  provider: string;
  provider_id?: string;
  payment_url?: string;
  payment_qr?: string;
  expires_at?: Date;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  createPayment(req: PaymentRequestRecord): Promise<ProviderCreateResponse>;
  // verify webhook payload; returns { request_id, tx_ref, amount_atomic }
  verifyWebhook(signature: string | undefined, payload: string): Promise<{
    request_id: string;
    tx_ref: string;
    amount_atomic: bigint;
    provider: string;
    raw: any;
  }>;
}

export class PaymentService {
  constructor(
    private db: DatabaseClient,
    private credits: CreditService,
    private providers: Partial<Record<PaymentMethod, PaymentProvider>> = {}
  ) {}

  /**
   * Create a payment request and, if needed, initialize provider-side invoice/charge.
   */
  async createRequest(params: CreatePaymentParams): Promise<PaymentChallenge> {
    const currency = params.currency || 'credits';
    const expiresAt = params.expires_in_seconds
      ? new Date(Date.now() + params.expires_in_seconds * 1000)
      : null;

    // Insert initial request
    const insert = await this.db.query(
      `INSERT INTO payment_requests (
        owner_did, amount_atomic, currency, method, status, description, expires_at
      ) VALUES ($1, $2, $3, $4, 'created', $5, $6) RETURNING *`,
      [
        params.owner_did,
        params.amount_atomic.toString(),
        currency,
        params.method,
        params.description || null,
        expiresAt
      ]
    );

    const request: PaymentRequestRecord = this.rowToRequest(insert.rows[0]);

    // Credits method requires no provider interaction; mark as paid instantly
    if (params.method === 'credits') {
      await this.markPaid(request.id, 'credits', `internal:${request.id}`, request.amount_atomic, { note: 'credits method' });
      return {
        request_id: request.id,
        amount_atomic: request.amount_atomic.toString(),
        currency,
        method: 'credits',
        headers: {
          // Client should retry the original request immediately
          'Retry-After': '0'
        }
      };
    }

    // Provider-backed method
    const provider = this.providers[params.method];
    if (!provider) {
      // Mark failed and throw
      await this.db.query(`UPDATE payment_requests SET status='failed', updated_at=NOW() WHERE id=$1`, [request.id]);
      throw new Error(`Payment provider not configured for method: ${params.method}`);
    }

    // Transition to pending and create provider-side charge
    const updatePending = await this.db.query(
      `UPDATE payment_requests SET status='pending', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [request.id]
    );
    const pending = this.rowToRequest(updatePending.rows[0]);

    const created = await provider.createPayment(pending);

    // Persist provider linkage
    await this.db.query(
      `UPDATE payment_requests SET provider=$1, provider_id=$2, provider_metadata=$3, expires_at=COALESCE($4, expires_at), updated_at=NOW()
       WHERE id=$5`,
      [
        created.provider,
        created.provider_id || null,
        JSON.stringify(created.metadata || {}),
        created.expires_at || null,
        request.id
      ]
    );

    const challenge: PaymentChallenge = {
      request_id: request.id,
      amount_atomic: request.amount_atomic.toString(),
      currency,
      method: params.method,
      provider: created.provider,
      provider_id: created.provider_id,
      payment_url: created.payment_url,
      payment_qr: created.payment_qr,
      expires_at: created.expires_at ? created.expires_at.toISOString() : undefined,
      headers: this.build402Headers(request.id, params.method, created),
      metadata: created.metadata
    };

    return challenge;
  }

  /**
   * Mark a payment request as paid and credit the ledger (idempotent).
   */
  async markPaid(
    requestId: string,
    provider: string,
    txRef: string,
    amountAtomic: bigint,
    raw?: any
  ): Promise<void> {
    // Start transaction
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');

      const sel = await client.query(`SELECT * FROM payment_requests WHERE id=$1 FOR UPDATE`, [requestId]);
      if (sel.rows.length === 0) {
        throw new Error(`Payment request not found: ${requestId}`);
      }
      const req = this.rowToRequest(sel.rows[0]);

      if (req.status === 'paid') {
        await client.query('COMMIT');
        return; // Idempotent
      }

      // Update request to paid
      await client.query(
        `UPDATE payment_requests SET status='paid', updated_at=NOW() WHERE id=$1`,
        [requestId]
      );

      // Insert receipt
      await client.query(
        `INSERT INTO payment_receipts (request_id, provider, tx_ref, amount_atomic, raw)
         VALUES ($1, $2, $3, $4, $5)`,
        [requestId, provider, txRef, amountAtomic.toString(), raw ? JSON.stringify(raw) : null]
      );

      // Credit the account (deposit)
      await this.credits.deposit(req.owner_did, amountAtomic, { request_id: requestId, provider, tx_ref: txRef });

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Process provider webhook: verify, mark paid, return request id.
   */
  async processWebhook(method: PaymentMethod, signature: string | undefined, payload: string): Promise<{ request_id: string }>{
    const provider = this.providers[method];
    if (!provider) throw new Error(`Provider not configured for method: ${method}`);
    const verified = await provider.verifyWebhook(signature, payload);
    await this.markPaid(verified.request_id, verified.provider, verified.tx_ref, verified.amount_atomic, verified.raw);
    return { request_id: verified.request_id };
  }

  /**
   * Get request by id
   */
  async getRequest(id: string): Promise<PaymentRequestRecord | null> {
    const res = await this.db.query(`SELECT * FROM payment_requests WHERE id=$1`, [id]);
    return res.rows.length ? this.rowToRequest(res.rows[0]) : null;
  }

  private rowToRequest(row: any): PaymentRequestRecord {
    return {
      id: row.id,
      owner_did: row.owner_did,
      amount_atomic: BigInt(row.amount_atomic),
      currency: row.currency,
      method: row.method,
      status: row.status,
      provider: row.provider || undefined,
      provider_id: row.provider_id || undefined,
      provider_metadata: row.provider_metadata || undefined,
      description: row.description || undefined,
      expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private build402Headers(requestId: string, method: PaymentMethod, created: ProviderCreateResponse): Record<string, string> {
    const www = `AINP-Pay realm="ainp", request_id="${requestId}", method="${method}"`;
    const headers: Record<string, string> = {
      'WWW-Authenticate': www,
    };
    if (created.payment_url) {
      headers['Link'] = `${created.payment_url}; rel="payment"`;
    }
    return headers;
  }
}

