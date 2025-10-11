import { v4 as uuidv4 } from 'uuid';
import type { AINPEnvelope, DiscoveryQuery, SemanticAddress } from '@ainp/core';
import { signEnvelope } from './crypto';

export interface AdvertiseOptions {
  baseUrl: string;           // e.g., http://localhost:8080
  did: string;               // did:key:...
  privateKey: Uint8Array;    // Ed25519 private key (32 bytes)
  ttlMinutes?: number;       // Advisory TTL for registration
  timeoutMs?: number;        // HTTP timeout
}

export interface DiscoverOptions {
  baseUrl: string;
  did: string;               // Sender DID for envelope
  privateKey: Uint8Array;    // Ed25519 private key (32 bytes)
  timeoutMs?: number;
}

async function postJson(url: string, body: unknown, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
 * Advertise an agent's capabilities via envelope-based endpoint
 */
export async function advertise(
  address: SemanticAddress,
  opts: AdvertiseOptions
): Promise<{ status: string; ttl_minutes: number }> {
  const now = Date.now();
  const envelope: AINPEnvelope = {
    version: '0.1.0',
    id: uuidv4(),
    trace_id: uuidv4(),
    from_did: opts.did,
    msg_type: 'ADVERTISE',
    ttl: 60_000, // 60s ttl for the request itself
    timestamp: now,
    sig: '',
    payload: {
      address,
      ttl_minutes: opts.ttlMinutes ?? 60,
    } as any,
  };

  envelope.sig = await signEnvelope(envelope, opts.privateKey);

  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/discovery/envelope`;
  return postJson(url, envelope, opts.timeoutMs);
}

/**
 * Discover agents using an envelope-based DISCOVER message
 */
export async function discover(
  query: DiscoveryQuery,
  opts: DiscoverOptions
): Promise<SemanticAddress[]> {
  const now = Date.now();
  const envelope: AINPEnvelope = {
    version: '0.1.0',
    id: uuidv4(),
    trace_id: uuidv4(),
    from_did: opts.did,
    to_query: query,
    msg_type: 'DISCOVER',
    ttl: 60_000,
    timestamp: now,
    sig: '',
    payload: { } as any,
  };

  envelope.sig = await signEnvelope(envelope, opts.privateKey);

  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/discovery/envelope`;
  const result = await postJson(url, envelope, opts.timeoutMs);
  return (result?.results || []) as SemanticAddress[];
}
