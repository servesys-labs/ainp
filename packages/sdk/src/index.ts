/**
 * AINP SDK
 * Main entry point for SDK exports
 */

// Core classes
export { AINPAgent } from './agent';
export { CreditManager } from './credits';

// Cryptography (legacy Node.js crypto)
export { generateKeyPair, signData, verifySignature, publicKeyToBase58, base58ToPublicKey } from './crypto';

// Cryptography (AINP envelope signing with Noble Ed25519 + DID:key)
export { generateKeypair, signEnvelope, verifyEnvelopeSignature, didToPublicKey } from './crypto';

// DID operations
export { createDID, resolveDID, extractPublicKey, validateDID } from './did';

// Discovery
export { cosineSimilarity, encodeEmbedding, decodeEmbedding, scoreAgents } from './discovery';

// Negotiation
export { calculateConvergence, generateCounterProposal, evaluateProposal } from './negotiation';

// Types
export * from './types';

// Errors
export * from './errors';

// Logger
export { Logger, LogLevel } from './logger';

// Discovery client helpers (HTTP + signed envelopes)
export { advertise, discover } from './discovery-client';

// Messaging client helpers (HTTP + signed envelopes)
export { sendIntent, getInbox, getThread } from './messaging-client';
export type { SendIntentParams, SendIntentOptions, GetInboxOptions, GetThreadOptions, Message, InboxResponse, Thread } from './messaging-client';

// Credits client helpers (balance, deposits, transactions)
export { getBalance, depositCredits, getTransactions } from './credits-client';
export type { GetBalanceOptions, DepositOptions, GetTransactionsOptions, CreditBalance, CreditTransaction } from './credits-client';

// WebSocket results client
export { ResultsWebSocket } from './results-ws';

// Memory manager (optional Redis-backed)
export { MemoryManager } from './memory';
