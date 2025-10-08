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
