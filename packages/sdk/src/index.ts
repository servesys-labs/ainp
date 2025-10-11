/**
 * AINP SDK
 * Main entry point for SDK exports
 */

// Core classes
export { AINPAgent } from './agent.js';
export { CreditManager } from './credits.js';

// Cryptography (legacy Node.js crypto)
export { generateKeyPair, signData, verifySignature, publicKeyToBase58, base58ToPublicKey } from './crypto.js';

// Cryptography (AINP envelope signing with Noble Ed25519 + DID:key)
export { generateKeypair, signEnvelope, verifyEnvelopeSignature, didToPublicKey } from './crypto.js';

// DID operations
export { createDID, resolveDID, extractPublicKey, validateDID } from './did.js';

// Discovery
export { cosineSimilarity, encodeEmbedding, decodeEmbedding, scoreAgents } from './discovery.js';

// Negotiation
export { calculateConvergence, generateCounterProposal, evaluateProposal } from './negotiation.js';

// Types
export * from './types.js';

// Errors
export * from './errors.js';

// Logger
export { Logger, LogLevel } from './logger.js';

// Discovery client helpers (HTTP + signed envelopes)
export { advertise, discover } from './discovery-client.js';

// Messaging client helpers (HTTP + signed envelopes)
export { sendIntent, getInbox, getThread } from './messaging-client.js';
export type { SendIntentParams, SendIntentOptions, GetInboxOptions, GetThreadOptions, Message, InboxResponse, Thread } from './messaging-client.js';

// Credits client helpers (balance, deposits, transactions)
export { getBalance, depositCredits, getTransactions } from './credits-client.js';
export type { GetBalanceOptions, DepositOptions, GetTransactionsOptions, CreditBalance, CreditTransaction } from './credits-client.js';

// WebSocket results client
export { ResultsWebSocket } from './results-ws.js';

// Memory manager (optional Redis-backed)
export { MemoryManager } from './memory.js';
