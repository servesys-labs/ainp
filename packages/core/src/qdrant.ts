/**
 * Qdrant Vector Store Client for AINP
 * Phase 0.1 - Foundation
 */

import { QdrantClient as QdrantSDK } from '@qdrant/js-client-rest'
import { Logger } from './logger.js'

const logger = new Logger({ serviceName: 'ainp-core:qdrant' })

export interface QdrantConfig {
  url?: string
  apiKey?: string
}

export interface UpsertCapabilityParams {
  agentId: string
  capabilityId: string
  embedding: number[]
  metadata: {
    description: string
    tags: string[]
    version: string
    evidence_vc?: string
  }
}

export interface SearchSimilarParams {
  queryEmbedding: number[]
  limit?: number
  threshold?: number
  tags?: string[]
}

export interface SearchResult {
  id: string
  score: number
  metadata: Record<string, any>
}

/**
 * Qdrant client wrapper for AINP
 */
export class QdrantClient {
  private client: QdrantSDK
  private config: QdrantConfig
  private readonly COLLECTION_CAPABILITIES = 'agent_capabilities'
  private readonly COLLECTION_ROUTING = 'intent_routing'
  private readonly VECTOR_SIZE = 1536 // OpenAI text-embedding-3-small

  constructor(config: QdrantConfig = {}) {
    this.config = {
      url: config.url || process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: config.apiKey || process.env.QDRANT_API_KEY,
    }

    this.client = new QdrantSDK({
      url: this.config.url,
      apiKey: this.config.apiKey,
    })
  }

  /**
   * Initialize collections
   */
  async initialize(): Promise<void> {
    await this.createCollectionIfNotExists(this.COLLECTION_CAPABILITIES)
    await this.createCollectionIfNotExists(this.COLLECTION_ROUTING)
    logger.info('Qdrant collections initialized')
  }

  /**
   * Create collection if it doesn't exist
   */
  private async createCollectionIfNotExists(
    collectionName: string
  ): Promise<void> {
    try {
      await this.client.getCollection(collectionName)
      logger.debug('Qdrant collection already exists', { collection: collectionName })
    } catch (error) {
      // Collection doesn't exist, create it
      await this.client.createCollection(collectionName, {
        vectors: {
          size: this.VECTOR_SIZE,
          distance: 'Cosine', // Cosine similarity
        },
        optimizers_config: {
          indexing_threshold: 10000,
        },
        hnsw_config: {
          m: 16,
          ef_construct: 100,
        },
      })
      logger.info('Created Qdrant collection', { collection: collectionName })
    }
  }

  /**
   * Upsert a capability embedding
   */
  async upsertCapability(params: UpsertCapabilityParams): Promise<string> {
    const pointId = params.capabilityId

    await this.client.upsert(this.COLLECTION_CAPABILITIES, {
      wait: true,
      points: [
        {
          id: pointId,
          vector: params.embedding,
          payload: {
            agent_id: params.agentId,
            description: params.metadata.description,
            tags: params.metadata.tags,
            version: params.metadata.version,
            evidence_vc: params.metadata.evidence_vc || null,
            created_at: new Date().toISOString(),
          },
        },
      ],
    })

    logger.debug('Upserted capability to Qdrant', {
      capabilityId: pointId,
      agentId: params.agentId
    })
    return pointId
  }

  /**
   * Search for similar capabilities
   */
  async searchSimilar(params: SearchSimilarParams): Promise<SearchResult[]> {
    const filter: any = {}

    // Add tag filter if provided
    if (params.tags && params.tags.length > 0) {
      filter.must = [
        {
          key: 'tags',
          match: {
            any: params.tags,
          },
        },
      ]
    }

    const results = await this.client.search(this.COLLECTION_CAPABILITIES, {
      vector: params.queryEmbedding,
      limit: params.limit || 10,
      score_threshold: params.threshold || 0.7,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      with_payload: true,
    })

    return results.map((result: any) => ({
      id: result.id.toString(),
      score: result.score,
      metadata: result.payload as Record<string, any>,
    }))
  }

  /**
   * Delete capabilities by agent ID
   */
  async deleteCapabilities(agentId: string): Promise<void> {
    await this.client.delete(this.COLLECTION_CAPABILITIES, {
      wait: true,
      filter: {
        must: [
          {
            key: 'agent_id',
            match: {
              value: agentId,
            },
          },
        ],
      },
    })

    logger.debug('Deleted capabilities from Qdrant', { agentId })
  }

  /**
   * Get capability by ID
   */
  async getCapability(capabilityId: string): Promise<SearchResult | null> {
    try {
      const result = await this.client.retrieve(this.COLLECTION_CAPABILITIES, {
        ids: [capabilityId],
        with_payload: true,
        with_vector: false,
      })

      if (result.length === 0) {
        return null
      }

      return {
        id: result[0].id.toString(),
        score: 1.0, // Perfect match
        metadata: result[0].payload as Record<string, any>,
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(collectionName: string): Promise<any> {
    return await this.client.getCollection(collectionName)
  }

  /**
   * Count points in collection
   */
  async countCapabilities(): Promise<number> {
    const info = await this.client.getCollection(this.COLLECTION_CAPABILITIES)
    return info.points_count || 0
  }

  /**
   * Cache intent routing decision (optional, for Phase 0.1)
   */
  async cacheRoutingDecision(
    intentId: string,
    intentEmbedding: number[],
    selectedAgentId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.client.upsert(this.COLLECTION_ROUTING, {
      wait: false, // Don't wait for cache
      points: [
        {
          id: intentId,
          vector: intentEmbedding,
          payload: {
            selected_agent_id: selectedAgentId,
            cached_at: new Date().toISOString(),
            ...metadata,
          },
        },
      ],
    })
  }

  /**
   * Search cached routing decisions
   */
  async searchCachedRouting(
    intentEmbedding: number[]
  ): Promise<SearchResult | null> {
    const results = await this.client.search(this.COLLECTION_ROUTING, {
      vector: intentEmbedding,
      limit: 1,
      score_threshold: 0.95, // Very high threshold for cache hits
      with_payload: true,
    })

    if (results.length === 0) {
      return null
    }

    return {
      id: results[0].id.toString(),
      score: results[0].score,
      metadata: results[0].payload as Record<string, any>,
    }
  }

  /**
   * Delete old routing cache entries (optional cleanup)
   */
  async cleanupRoutingCache(olderThanDays: number = 7): Promise<void> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    await this.client.delete(this.COLLECTION_ROUTING, {
      wait: true,
      filter: {
        must: [
          {
            key: 'cached_at',
            range: {
              lt: cutoffDate.toISOString(),
            },
          },
        ],
      },
    })

    logger.info('Cleaned up Qdrant routing cache', { olderThanDays })
  }

  /**
   * Create snapshot (backup)
   */
  async createSnapshot(collectionName: string): Promise<any> {
    return await this.client.createSnapshot(collectionName)
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections()
      return true
    } catch (error) {
      return false
    }
  }
}

/**
 * Create a Qdrant client
 */
export function createQdrantClient(config?: QdrantConfig): QdrantClient {
  return new QdrantClient(config)
}
