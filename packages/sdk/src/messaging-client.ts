import { v4 as uuidv4 } from 'uuid';
import type { AINPEnvelope, AINPIntent } from '@ainp/core';
import { signEnvelope } from './crypto';

export interface SendIntentOptions {
  baseUrl: string;
  did: string;
  privateKey: Uint8Array;
  timeoutMs?: number;
}

export interface SendIntentParams {
  to_did: string;
  intent_type: string;
  payload: Record<string, unknown>;
  subject?: string;
  conversation_id?: string;
}

export interface GetInboxOptions {
  baseUrl: string;
  did: string;
  limit?: number;
  cursor?: string;
  label?: string;
  unread_only?: boolean;
  timeoutMs?: number;
}

export interface GetThreadOptions {
  baseUrl: string;
  did: string;
  conversation_id: string;
  timeoutMs?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  from_did: string;
  to_dids: string[];
  subject: string | null;
  body_text: string;
  body_html: string | null;
  received_at: string;
  read: boolean;
  labels: string[];
}

export interface InboxResponse {
  messages: Message[];
  pagination: {
    limit: number;
    cursor: string | null;
    has_more: boolean;
  };
}

export interface Thread {
  conversation_id: string;
  messages: Message[];
  participants: string[];
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

/**
 * Send an intent message to another agent
 */
export async function sendIntent(
  params: SendIntentParams,
  opts: SendIntentOptions
): Promise<{ status: string; message_id: string }> {
  const now = Date.now();

  const intent: AINPIntent = {
    '@context': 'https://ainp.dev/contexts/intent/v1',
    '@type': params.intent_type,
    version: '0.1.0',
    embedding: '',
    semantics: params.payload,
    budget: {
      max_credits: 1000,
      max_rounds: 3,
      timeout_ms: 30000,
    },
  };

  const envelope: AINPEnvelope = {
    version: '0.1.0',
    id: uuidv4(),
    trace_id: params.conversation_id || uuidv4(),
    from_did: opts.did,
    to_did: params.to_did,
    msg_type: 'INTENT',
    ttl: 60_000,
    timestamp: now,
    sig: '',
    payload: intent,
  };

  envelope.sig = await signEnvelope(envelope, opts.privateKey);

  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/intents/send`;
  const result = await postJson(url, { envelope }, opts.timeoutMs);

  return {
    status: result.status || 'sent',
    message_id: envelope.id,
  };
}

/**
 * Get inbox messages with pagination
 */
export async function getInbox(opts: GetInboxOptions): Promise<InboxResponse> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', opts.limit.toString());
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.label) params.set('label', opts.label);
  if (opts.unread_only) params.set('unread', 'true');

  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/mail/inbox?${params.toString()}`;

  return getJson(url, { 'x-ainp-did': opts.did }, opts.timeoutMs);
}

/**
 * Get a conversation thread by conversation_id
 */
export async function getThread(opts: GetThreadOptions): Promise<Thread> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/mail/threads/${encodeURIComponent(opts.conversation_id)}`;

  return getJson(url, { 'x-ainp-did': opts.did }, opts.timeoutMs);
}
