/**
 * NATS JetStream Client for AINP
 * Phase 0.1 - Foundation
 */

import {
  connect,
  NatsConnection,
  JetStreamClient,
  JetStreamManager,
  StorageType,
  RetentionPolicy,
  ConsumerConfig,
  StreamConfig,
  AckPolicy,
} from 'nats'
import { Logger } from '@ainp/sdk'

const logger = new Logger({ serviceName: 'ainp-core:nats' })

export interface NATSConfig {
  url?: string
  maxReconnectAttempts?: number
  reconnectTimeWait?: number
}

export interface PublishIntentParams {
  agentId: string
  intent: any
  messageId?: string
}

export interface SubscribeToAgentParams {
  agentId: string
  handler: (msg: any) => Promise<void>
}

/**
 * NATS JetStream client wrapper
 */
export class NATSClient {
  private connection: NatsConnection | null = null
  private jetstream: JetStreamClient | null = null
  private jsm: JetStreamManager | null = null
  private config: NATSConfig

  constructor(config: NATSConfig = {}) {
    this.config = {
      url: config.url || process.env.NATS_URL || 'nats://localhost:4222',
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      reconnectTimeWait: config.reconnectTimeWait || 2000,
    }
  }

  /**
   * Connect to NATS server
   */
  async connect(): Promise<void> {
    if (this.connection) {
      return
    }

    this.connection = await connect({
      servers: this.config.url,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      reconnectTimeWait: this.config.reconnectTimeWait,
    })

    this.jetstream = this.connection.jetstream()
    this.jsm = await this.connection.jetstreamManager()

    logger.info('Connected to NATS', { url: this.config.url })

    // Setup default streams
    await this.setupStreams()
  }

  /**
   * Setup default JetStream streams
   */
  private async setupStreams(): Promise<void> {
    if (!this.jsm) {
      throw new Error('JetStream manager not initialized')
    }

    const streams: Partial<StreamConfig>[] = [
      {
        name: 'AINP_INTENTS',
        subjects: ['ainp.agent.*.intents'],
        retention: RetentionPolicy.Limits,
        max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days in nanoseconds
        max_bytes: 10 * 1024 * 1024 * 1024, // 10GB
        storage: StorageType.File,
        duplicate_window: 2 * 60 * 1e9, // 2 minutes deduplication
      },
      {
        name: 'AINP_NEGOTIATIONS',
        subjects: ['ainp.negotiations.*'],
        retention: RetentionPolicy.Limits,
        max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days
        max_bytes: 5 * 1024 * 1024 * 1024, // 5GB
        storage: StorageType.File,
        duplicate_window: 2 * 60 * 1e9,
      },
      {
        name: 'AINP_RESULTS',
        subjects: ['ainp.agent.*.results'],
        retention: RetentionPolicy.Limits,
        max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days
        max_bytes: 10 * 1024 * 1024 * 1024, // 10GB
        storage: StorageType.File,
        duplicate_window: 2 * 60 * 1e9,
      },
    ]

    for (const streamConfig of streams) {
      try {
        await this.jsm.streams.add(streamConfig)
        logger.info('Created NATS stream', { stream: streamConfig.name })
      } catch (error: any) {
        if (error.message?.includes('already in use')) {
          logger.debug('NATS stream already exists', { stream: streamConfig.name })
        } else {
          throw error
        }
      }
    }
  }

  /**
   * Publish an intent to an agent
   */
  async publishIntent(params: PublishIntentParams): Promise<void> {
    if (!this.jetstream) {
      throw new Error('JetStream client not initialized')
    }

    const subject = `ainp.agent.${params.agentId}.intents`
    const payload = JSON.stringify(params.intent)

    await this.jetstream.publish(subject, new TextEncoder().encode(payload), {
      msgID: params.messageId || crypto.randomUUID(),
    })

    logger.debug('Published intent to NATS', { subject, agentId: params.agentId })
  }

  /**
   * Subscribe to intents for an agent
   */
  async subscribeToAgent(params: SubscribeToAgentParams): Promise<void> {
    if (!this.jetstream) {
      throw new Error('JetStream client not initialized')
    }

    const subject = `ainp.agent.${params.agentId}.intents`

    // Create consumer config
    const consumerConfig: Partial<ConsumerConfig> = {
      durable_name: `agent_${params.agentId}`,
      ack_policy: AckPolicy.Explicit,
      max_deliver: 3,
      ack_wait: 30 * 1e9, // 30 seconds in nanoseconds
    }

    const consumer = await this.jetstream.consumers.get(
      'AINP_INTENTS',
      consumerConfig.durable_name!
    )

    // Start consuming messages
    const messages = await consumer.consume()

    ;(async () => {
      for await (const msg of messages) {
        try {
          const payload = JSON.parse(new TextDecoder().decode(msg.data))
          await params.handler(payload)
          msg.ack()
        } catch (error: any) {
          logger.error('Error processing NATS message', {
            subject,
            error: error.message,
            agentId: params.agentId
          })
          msg.nak() // Negative acknowledge for retry
        }
      }
    })()

    logger.info('Subscribed to NATS subject', { subject, agentId: params.agentId })
  }

  /**
   * Publish a negotiation message
   */
  async publishNegotiation(
    negotiationId: string,
    message: any
  ): Promise<void> {
    if (!this.jetstream) {
      throw new Error('JetStream client not initialized')
    }

    const subject = `ainp.negotiations.${negotiationId}`
    const payload = JSON.stringify(message)

    await this.jetstream.publish(subject, new TextEncoder().encode(payload), {
      msgID: crypto.randomUUID(),
    })

    logger.debug('Published negotiation message to NATS', { subject, negotiationId })
  }

  /**
   * Subscribe to negotiation messages
   */
  async subscribeToNegotiation(
    negotiationId: string,
    handler: (msg: any) => Promise<void>
  ): Promise<void> {
    if (!this.jetstream) {
      throw new Error('JetStream client not initialized')
    }

    const subject = `ainp.negotiations.${negotiationId}`

    const consumerConfig: Partial<ConsumerConfig> = {
      durable_name: `negotiation_${negotiationId}`,
      ack_policy: AckPolicy.Explicit,
      max_deliver: 3,
      ack_wait: 5 * 1e9, // 5 seconds
    }

    const consumer = await this.jetstream.consumers.get(
      'AINP_NEGOTIATIONS',
      consumerConfig.durable_name!
    )

    const messages = await consumer.consume()

    ;(async () => {
      for await (const msg of messages) {
        try {
          const payload = JSON.parse(new TextDecoder().decode(msg.data))
          await handler(payload)
          msg.ack()
        } catch (error: any) {
          logger.error('Error processing negotiation message', {
            subject,
            error: error.message,
            negotiationId
          })
          msg.nak()
        }
      }
    })()

    logger.info('Subscribed to negotiation', { subject, negotiationId })
  }

  /**
   * Publish a result message
   */
  async publishResult(agentId: string, result: any): Promise<void> {
    if (!this.jetstream) {
      throw new Error('JetStream client not initialized')
    }

    const subject = `ainp.agent.${agentId}.results`
    const payload = JSON.stringify(result)

    await this.jetstream.publish(subject, new TextEncoder().encode(payload), {
      msgID: crypto.randomUUID(),
    })

    logger.debug('Published result to NATS', { subject, agentId })
  }

  /**
   * Get stream info
   */
  async getStreamInfo(streamName: string): Promise<any> {
    if (!this.jsm) {
      throw new Error('JetStream manager not initialized')
    }

    return await this.jsm.streams.info(streamName)
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close()
      this.connection = null
      this.jetstream = null
      this.jsm = null
      logger.info('NATS connection closed')
    }
  }
}

/**
 * Create a NATS client
 */
export function createNATSClient(config?: NATSConfig): NATSClient {
  return new NATSClient(config)
}

/**
 * Health check for NATS connection
 * @param client NATS client instance
 * @returns true if connected or reconnecting, false otherwise
 */
export async function isConnected(client: NATSClient): Promise<boolean> {
  try {
    // Access the private connection through the client
    const connection = (client as any).connection as NatsConnection | null
    if (!connection) {
      return false
    }
    // Check if connection is closed
    if (connection.isClosed()) {
      return false
    }
    // If not closed and exists, it's connected
    return true
  } catch {
    return false
  }
}

/**
 * Ensure JetStream streams exist (idempotent)
 * Creates required streams if they don't exist
 * @param client NATS client instance
 */
export async function ensureStreamsExist(client: NATSClient): Promise<void> {
  const jsm = (client as any).jsm as JetStreamManager | null
  if (!jsm) {
    throw new Error('JetStream manager not initialized - call connect() first')
  }

  const streamConfigs: Partial<StreamConfig>[] = [
    {
      name: 'AINP_INTENTS',
      subjects: ['ainp.agent.*.intents'],
      retention: RetentionPolicy.Limits,
      max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days in nanoseconds
      max_bytes: 10 * 1024 * 1024 * 1024, // 10GB
      storage: StorageType.File,
      duplicate_window: 2 * 60 * 1e9, // 2 minutes
    },
    {
      name: 'AINP_NEGOTIATIONS',
      subjects: ['ainp.negotiations.*'],
      retention: RetentionPolicy.Limits,
      max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days
      max_bytes: 5 * 1024 * 1024 * 1024, // 5GB
      storage: StorageType.File,
      duplicate_window: 2 * 60 * 1e9,
    },
    {
      name: 'AINP_RESULTS',
      subjects: ['ainp.agent.*.results'],
      retention: RetentionPolicy.Limits,
      max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days
      max_bytes: 10 * 1024 * 1024 * 1024, // 10GB
      storage: StorageType.File,
      duplicate_window: 2 * 60 * 1e9,
    },
  ]

  for (const config of streamConfigs) {
    try {
      await jsm.streams.info(config.name!)
      logger.debug('NATS stream exists', { stream: config.name })
    } catch (error: any) {
      if (error.code === '404' || error.message?.includes('stream not found')) {
        await jsm.streams.add(config)
        logger.info('Created NATS stream', { stream: config.name })
      } else {
        throw error
      }
    }
  }
}
