/**
 * Credits API client helpers
 * Manage credit balance, transfers, and transaction history
 */

export interface GetBalanceOptions {
  baseUrl: string;
  did: string;
  timeoutMs?: number;
}

export interface DepositOptions {
  baseUrl: string;
  did: string;
  amount: number; // In atomic units (1 credit = 1000 atomic units)
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface GetTransactionsOptions {
  baseUrl: string;
  did: string;
  limit?: number;
  offset?: number;
  timeoutMs?: number;
}

export interface CreditBalance {
  balance: string; // bigint as string
  earned: string;
  spent: string;
  reserved: string;
}

export interface CreditTransaction {
  id: string;
  agent_did: string;
  type: 'earn' | 'spend' | 'reserve' | 'release' | 'deposit';
  amount: string; // bigint as string
  intent_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get credit balance for an agent
 */
export async function getBalance(opts: GetBalanceOptions): Promise<CreditBalance> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/credits/${encodeURIComponent(opts.did)}`;
  return getJson(url, {}, opts.timeoutMs);
}

/**
 * Deposit credits into account (admin/testing)
 */
export async function depositCredits(opts: DepositOptions): Promise<{ message: string; new_balance: string }> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/credits/deposit`;
  return postJson(
    url,
    {
      agent_did: opts.did,
      amount: opts.amount,
      metadata: opts.metadata,
    },
    { 'x-ainp-did': opts.did },
    opts.timeoutMs
  );
}

/**
 * Get transaction history for an agent
 */
export async function getTransactions(opts: GetTransactionsOptions): Promise<CreditTransaction[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', opts.limit.toString());
  if (opts.offset) params.set('offset', opts.offset.toString());

  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/credits/${encodeURIComponent(opts.did)}/transactions?${params.toString()}`;
  const result = await getJson(url, {}, opts.timeoutMs);
  return result.transactions || [];
}
