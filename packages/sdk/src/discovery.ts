/**
 * AINP Discovery Client
 * Semantic discovery via embedding similarity
 * Spec: RFC 001-SPEC Section 5
 */

import { DiscoveryQuery, SemanticAddress } from '@ainp/core';
import { DiscoveryError } from './errors';
import { Logger } from './logger';
import { DiscoveryMatch } from './types';

const logger = new Logger({ serviceName: 'ainp-discovery' });

/**
 * Calculate cosine similarity between two embeddings
 * @param a - First embedding (base64-encoded Float32Array)
 * @param b - Second embedding (base64-encoded Float32Array)
 * @returns Similarity score (0-1)
 */
export function cosineSimilarity(a: string, b: string): number {
  const aVector = decodeEmbedding(a);
  const bVector = decodeEmbedding(b);

  if (aVector.length !== bVector.length) {
    throw new DiscoveryError('Embedding dimensions must match');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < aVector.length; i++) {
    dotProduct += aVector[i] * bVector[i];
    normA += aVector[i] * aVector[i];
    normB += bVector[i] * bVector[i];
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

  return Math.max(0, Math.min(1, similarity)); // Clamp to [0, 1]
}

/**
 * Decode base64-encoded embedding to Float32Array
 * @param base64 - Base64-encoded embedding
 * @returns Float32Array
 */
export function decodeEmbedding(base64: string): Float32Array {
  const bytes = Buffer.from(base64, 'base64');
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/**
 * Encode Float32Array to base64
 * @param embedding - Float32Array embedding
 * @returns Base64-encoded string
 */
export function encodeEmbedding(embedding: Float32Array): string {
  const bytes = new Uint8Array(embedding.buffer);
  return Buffer.from(bytes).toString('base64');
}

/**
 * Score agents based on query similarity
 * @param query - Discovery query with embedding
 * @param agents - List of semantic addresses
 * @returns Sorted list of discovery matches
 */
export function scoreAgents(
  query: DiscoveryQuery,
  agents: SemanticAddress[]
): DiscoveryMatch[] {
  if (!query.embedding) {
    throw new DiscoveryError('Query embedding is required for scoring');
  }

  const scoredMatches = agents
    .map((agent) => {
      // Find best matching capability
      const capabilitySimilarities = agent.capabilities.map((cap) =>
        cosineSimilarity(query.embedding!, cap.embedding)
      );

      const maxSimilarity = Math.max(...capabilitySimilarities, 0);

      // Apply filters
      if (query.min_trust && agent.trust.score < query.min_trust) {
        return null; // Skip agents below trust threshold
      }

      if (query.tags && query.tags.length > 0) {
        const hasMatchingTag = agent.capabilities.some((cap) =>
          query.tags!.some((tag) => cap.tags.includes(tag))
        );
        if (!hasMatchingTag) {
          return null; // Skip agents without matching tags
        }
      }

      // Combined score: 70% similarity + 30% trust
      const score = maxSimilarity * 0.7 + agent.trust.score * 0.3;

      return {
        did: agent.did,
        similarity: maxSimilarity,
        trust: {
          score: agent.trust.score,
          dimensions: agent.trust.dimensions,
        },
        capabilities: agent.capabilities.map((cap) => ({
          description: cap.description,
          tags: cap.tags,
          version: cap.version,
        })),
        score, // Internal score for sorting
      };
    })
    .filter((match) => match !== null)
    .sort((a, b) => b!.score - a!.score);

  // Remove internal score field and ensure type safety
  const results: DiscoveryMatch[] = scoredMatches.map((match) => {
    const { score, ...cleanMatch } = match!;
    return cleanMatch;
  });

  logger.debug('Scored agents', {
    queryTags: query.tags,
    minTrust: query.min_trust,
    totalAgents: agents.length,
    matchedAgents: results.length,
  });

  return results;
}

/**
 * Filter agents by cost and latency constraints
 * @param matches - Discovery matches
 * @param maxCost - Maximum cost in credits
 * @param maxLatencyMs - Maximum latency in milliseconds
 * @returns Filtered matches
 */
export function filterByConstraints(
  matches: DiscoveryMatch[],
  maxCost?: number,
  maxLatencyMs?: number
): DiscoveryMatch[] {
  // Note: Cost and latency filtering would require additional metadata
  // from the agent's capabilities. This is planned for Phase 0.3.
  // See docs/ROADMAP.md for enhancement roadmap.

  logger.debug('Applied constraints', {
    maxCost,
    maxLatencyMs,
    inputMatches: matches.length,
    outputMatches: matches.length,
  });

  return matches;
}
