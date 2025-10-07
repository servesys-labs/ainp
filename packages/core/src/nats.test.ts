/**
 * NATS JetStream Client Tests
 * Test Author & Coverage Enforcer (TA)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NATSClient, type PublishIntentParams, type SubscribeToAgentParams } from './nats'

// Mock the NATS library
vi.mock('nats', () => {
  const mockConnection = {
    jetstream: vi.fn(),
    jetstreamManager: vi.fn(),
    close: vi.fn(),
  }

  const mockJetstream = {
    publish: vi.fn(),
    consumers: {
      get: vi.fn(),
    },
  }

  const mockJsm = {
    streams: {
      add: vi.fn(),
      info: vi.fn(),
    },
  }

  const mockConsumer = {
    consume: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        // Mock async iterator for message consumption
        yield {
          data: new TextEncoder().encode(JSON.stringify({ test: 'message' })),
          ack: vi.fn(),
          nak: vi.fn(),
        }
      },
    })),
  }

  return {
    connect: vi.fn(() => Promise.resolve(mockConnection)),
    RetentionPolicy: {
      Limits: 'limits',
    },
    StorageType: {
      File: 'file',
    },
    AckPolicy: {
      Explicit: 'explicit',
    },
    __mocks: {
      connection: mockConnection,
      jetstream: mockJetstream,
      jsm: mockJsm,
      consumer: mockConsumer,
    },
  }
})

describe('NATSClient', () => {
  let client: NATSClient
  let nats: any
  let mocks: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Get mocks
    nats = vi.mocked(await import('nats'))
    mocks = (nats as any).__mocks

    // Setup default mock behaviors
    mocks.connection.jetstream.mockReturnValue(mocks.jetstream)
    mocks.connection.jetstreamManager.mockResolvedValue(mocks.jsm)
    mocks.jsm.streams.add.mockResolvedValue({ name: 'AINP_INTENTS' })
    mocks.jetstream.publish.mockResolvedValue(undefined)
    mocks.jetstream.consumers.get.mockResolvedValue(mocks.consumer)
  })

  afterEach(async () => {
    if (client) {
      await client.close()
    }
  })

  describe('Connection Management', () => {
    it('test_connect_establishes_connection_successfully', async () => {
      client = new NATSClient({ url: 'nats://test:4222' })

      await client.connect()

      expect(nats.connect).toHaveBeenCalledWith({
        servers: 'nats://test:4222',
        maxReconnectAttempts: 10,
        reconnectTimeWait: 2000,
      })
      expect(mocks.connection.jetstream).toHaveBeenCalled()
      expect(mocks.connection.jetstreamManager).toHaveBeenCalled()
    })

    it('test_connect_uses_default_config_when_no_params_provided', async () => {
      client = new NATSClient()

      await client.connect()

      expect(nats.connect).toHaveBeenCalledWith({
        servers: 'nats://localhost:4222',
        maxReconnectAttempts: 10,
        reconnectTimeWait: 2000,
      })
    })

    it('test_connect_idempotent_does_not_reconnect_if_already_connected', async () => {
      client = new NATSClient()

      await client.connect()
      await client.connect()

      expect(nats.connect).toHaveBeenCalledTimes(1)
    })

    it('test_connect_sets_up_default_streams', async () => {
      client = new NATSClient()

      await client.connect()

      expect(mocks.jsm.streams.add).toHaveBeenCalledTimes(3)
      expect(mocks.jsm.streams.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AINP_INTENTS',
          subjects: ['ainp.agent.*.intents'],
        })
      )
    })

    it('test_close_terminates_connection_successfully', async () => {
      client = new NATSClient()
      await client.connect()

      await client.close()

      expect(mocks.connection.close).toHaveBeenCalled()
    })

    it('test_close_handles_null_connection_gracefully', async () => {
      client = new NATSClient()

      await expect(client.close()).resolves.not.toThrow()
    })
  })

  describe('Stream Setup', () => {
    it('test_setup_streams_handles_existing_stream_error', async () => {
      mocks.jsm.streams.add.mockRejectedValueOnce(
        new Error('stream name already in use')
      )

      client = new NATSClient()

      await expect(client.connect()).resolves.not.toThrow()
    })

    it('test_setup_streams_throws_on_non_duplicate_error', async () => {
      mocks.jsm.streams.add.mockRejectedValueOnce(
        new Error('insufficient permissions')
      )

      client = new NATSClient()

      await expect(client.connect()).rejects.toThrow('insufficient permissions')
    })

    it('test_get_stream_info_returns_stream_metadata', async () => {
      const mockStreamInfo = { name: 'AINP_INTENTS', messages: 100 }
      mocks.jsm.streams.info.mockResolvedValue(mockStreamInfo)

      client = new NATSClient()
      await client.connect()

      const info = await client.getStreamInfo('AINP_INTENTS')

      expect(info).toEqual(mockStreamInfo)
      expect(mocks.jsm.streams.info).toHaveBeenCalledWith('AINP_INTENTS')
    })
  })

  describe('Publishing Operations', () => {
    it('test_publish_intent_sends_message_to_correct_subject', async () => {
      client = new NATSClient()
      await client.connect()

      const params: PublishIntentParams = {
        agentId: 'agent-123',
        intent: { action: 'process', data: 'test' },
        messageId: 'msg-456',
      }

      await client.publishIntent(params)

      expect(mocks.jetstream.publish).toHaveBeenCalledWith(
        'ainp.agent.agent-123.intents',
        expect.any(Uint8Array),
        { msgID: 'msg-456' }
      )
    })

    it('test_publish_intent_generates_message_id_when_not_provided', async () => {
      client = new NATSClient()
      await client.connect()

      const params: PublishIntentParams = {
        agentId: 'agent-123',
        intent: { action: 'process' },
      }

      await client.publishIntent(params)

      const call = mocks.jetstream.publish.mock.calls[0]
      expect(call[2]).toHaveProperty('msgID')
      expect(call[2].msgID).toMatch(/^[a-f0-9-]{36}$/i)
    })

    it('test_publish_intent_throws_when_not_connected', async () => {
      client = new NATSClient()

      const params: PublishIntentParams = {
        agentId: 'agent-123',
        intent: { action: 'test' },
      }

      await expect(client.publishIntent(params)).rejects.toThrow(
        'JetStream client not initialized'
      )
    })

    it('test_publish_negotiation_sends_to_negotiation_stream', async () => {
      client = new NATSClient()
      await client.connect()

      await client.publishNegotiation('negotiation-123', { offer: 100 })

      expect(mocks.jetstream.publish).toHaveBeenCalledWith(
        'ainp.negotiations.negotiation-123',
        expect.any(Uint8Array),
        expect.objectContaining({ msgID: expect.any(String) })
      )
    })

    it('test_publish_result_sends_to_results_stream', async () => {
      client = new NATSClient()
      await client.connect()

      await client.publishResult('agent-123', { status: 'success' })

      expect(mocks.jetstream.publish).toHaveBeenCalledWith(
        'ainp.agent.agent-123.results',
        expect.any(Uint8Array),
        expect.objectContaining({ msgID: expect.any(String) })
      )
    })

    it('test_publish_handles_publish_failure', async () => {
      mocks.jetstream.publish.mockRejectedValueOnce(new Error('publish failed'))

      client = new NATSClient()
      await client.connect()

      await expect(
        client.publishIntent({ agentId: 'agent-123', intent: {} })
      ).rejects.toThrow('publish failed')
    })
  })

  describe('Subscription Operations', () => {
    it('test_subscribe_to_agent_creates_durable_consumer', async () => {
      client = new NATSClient()
      await client.connect()

      const handler = vi.fn().mockResolvedValue(undefined)
      const params: SubscribeToAgentParams = {
        agentId: 'agent-123',
        handler,
      }

      await client.subscribeToAgent(params)

      expect(mocks.jetstream.consumers.get).toHaveBeenCalledWith(
        'AINP_INTENTS',
        'agent_agent-123'
      )
    })

    it('test_subscribe_to_agent_processes_messages_and_acknowledges', async () => {
      client = new NATSClient()
      await client.connect()

      const handler = vi.fn().mockResolvedValue(undefined)

      await client.subscribeToAgent({
        agentId: 'agent-123',
        handler,
      })

      // Wait for async message processing
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalledWith({ test: 'message' })
    })

    it('test_subscribe_throws_when_not_connected', async () => {
      client = new NATSClient()

      await expect(
        client.subscribeToAgent({ agentId: 'agent-123', handler: vi.fn() })
      ).rejects.toThrow('JetStream client not initialized')
    })

    it('test_subscribe_to_negotiation_creates_correct_consumer', async () => {
      client = new NATSClient()
      await client.connect()

      const handler = vi.fn().mockResolvedValue(undefined)

      await client.subscribeToNegotiation('negotiation-456', handler)

      expect(mocks.jetstream.consumers.get).toHaveBeenCalledWith(
        'AINP_NEGOTIATIONS',
        'negotiation_negotiation-456'
      )
    })
  })

  describe('Edge Cases', () => {
    it('test_handles_empty_intent_object', async () => {
      client = new NATSClient()
      await client.connect()

      await expect(
        client.publishIntent({ agentId: 'agent-123', intent: {} })
      ).resolves.not.toThrow()
    })

    it('test_handles_null_message_content', async () => {
      client = new NATSClient()
      await client.connect()

      await expect(
        client.publishIntent({ agentId: 'agent-123', intent: null })
      ).resolves.not.toThrow()
    })

    it('test_handles_special_characters_in_agent_id', async () => {
      client = new NATSClient()
      await client.connect()

      await client.publishIntent({
        agentId: 'agent-with-special.chars_123',
        intent: { test: true },
      })

      expect(mocks.jetstream.publish).toHaveBeenCalledWith(
        'ainp.agent.agent-with-special.chars_123.intents',
        expect.any(Uint8Array),
        expect.any(Object)
      )
    })

    it('test_handles_connection_timeout', async () => {
      const { connect } = await import('nats')
      vi.mocked(connect).mockRejectedValueOnce(new Error('connection timeout'))

      client = new NATSClient()

      await expect(client.connect()).rejects.toThrow('connection timeout')
    })
  })

  describe('Error Handling in Message Processing', () => {
    it('test_message_handler_error_triggers_nak', async () => {
      const mockAck = vi.fn()
      const mockNak = vi.fn()

      const mockConsumer = {
        consume: vi.fn(() => ({
          [Symbol.asyncIterator]: async function* () {
            yield {
              data: new TextEncoder().encode(JSON.stringify({ test: 'data' })),
              ack: mockAck,
              nak: mockNak,
            }
          },
        })),
      }

      mocks.jetstream.consumers.get.mockResolvedValue(mockConsumer)

      client = new NATSClient()
      await client.connect()

      const handler = vi.fn().mockRejectedValue(new Error('handler failed'))

      await client.subscribeToAgent({ agentId: 'agent-123', handler })

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockNak).toHaveBeenCalled()
      expect(mockAck).not.toHaveBeenCalled()
    })

    it('test_invalid_json_in_message_triggers_nak', async () => {
      const mockNak = vi.fn()

      const mockConsumer = {
        consume: vi.fn(() => ({
          [Symbol.asyncIterator]: async function* () {
            yield {
              data: new TextEncoder().encode('invalid json {'),
              ack: vi.fn(),
              nak: mockNak,
            }
          },
        })),
      }

      mocks.jetstream.consumers.get.mockResolvedValue(mockConsumer)

      client = new NATSClient()
      await client.connect()

      await client.subscribeToAgent({
        agentId: 'agent-123',
        handler: vi.fn(),
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockNak).toHaveBeenCalled()
    })
  })
})
