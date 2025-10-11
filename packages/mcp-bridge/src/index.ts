#!/usr/bin/env node

/**
 * AINP MCP Bridge - Model Context Protocol server for AINP
 * Enables AI agents to communicate via the AINP network
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { advertise, discover, sendIntent, getInbox, getThread, getBalance } from '@ainp/sdk';
import type { DiscoveryQuery, SemanticAddress, SendIntentParams } from '@ainp/sdk';
import { loadConfig } from './config.js';
import { AINPEventBridge } from './bridge.js';

// Load configuration
const config = loadConfig();

// Convert base64 string to Uint8Array
const privateKeyBytes = typeof config.privateKey === 'string'
  ? Uint8Array.from(Buffer.from(config.privateKey, 'base64'))
  : config.privateKey;

// Create MCP server
const server = new Server(
  {
    name: 'ainp-mcp-bridge',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: 'ainp.advertise',
    description: 'Advertise agent capabilities on AINP network for discovery',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of agent capabilities',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization (e.g., ["email", "calendar"])',
        },
        ttl_minutes: {
          type: 'number',
          description: 'Time-to-live in minutes (default: 60)',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'ainp.discover',
    description: 'Discover agents on AINP network by semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query describing desired capabilities',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tag filters',
        },
        min_trust: {
          type: 'number',
          description: 'Minimum trust score (0-1, default: 0.5)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'ainp.send_intent',
    description: 'Send an intent message to another agent on AINP network',
    inputSchema: {
      type: 'object',
      properties: {
        to_did: {
          type: 'string',
          description: 'Recipient agent DID',
        },
        intent_type: {
          type: 'string',
          description: 'Intent type (e.g., "schedule_meeting", "summarize_email")',
        },
        payload: {
          type: 'object',
          description: 'Intent payload data',
        },
        subject: {
          type: 'string',
          description: 'Message subject (optional)',
        },
        conversation_id: {
          type: 'string',
          description: 'Conversation ID to continue existing thread (optional)',
        },
      },
      required: ['to_did', 'intent_type', 'payload'],
    },
  },
  {
    name: 'ainp.inbox',
    description: 'Get inbox messages with pagination',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum messages to return (default: 50, max: 200)',
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from previous response',
        },
        label: {
          type: 'string',
          description: 'Filter by label (optional)',
        },
        unread_only: {
          type: 'boolean',
          description: 'Only show unread messages (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'ainp.thread',
    description: 'Get a conversation thread by conversation ID',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'Conversation ID to retrieve',
        },
      },
      required: ['conversation_id'],
    },
  },
  {
    name: 'ainp.wallet.balance',
    description: 'Check credit balance and transaction summary',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [{
        type: 'text',
        text: '❌ Error: No arguments provided',
      }],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'ainp.advertise': {
        const address: SemanticAddress = {
          did: config.did,
          capabilities: [{
            description: args.description as string,
            tags: (args.tags as string[]) || [],
            embedding: '',
            version: '0.1.0',
          }],
          trust: {
            score: 0.5,
            dimensions: {
              reliability: 0.5,
              honesty: 0.5,
              competence: 0.5,
              timeliness: 0.5,
            },
            decay_rate: 0.1,
            last_updated: Date.now(),
          },
        };

        const result = await advertise(address, {
          baseUrl: config.baseUrl,
          did: config.did,
          privateKey: privateKeyBytes,
          ttlMinutes: (args.ttl_minutes as number) || 60,
          timeoutMs: config.timeoutMs,
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Advertised on AINP network\nTTL: ${result.ttl_minutes} minutes\nStatus: ${result.status}`,
            },
          ],
        };
      }

      case 'ainp.discover': {
        const query: DiscoveryQuery = {
          description: args.query as string,
          tags: (args.tags as string[]) || undefined,
          min_trust: (args.min_trust as number) || 0.5,
        };

        const results = await discover(query, {
          baseUrl: config.baseUrl,
          did: config.did,
          privateKey: privateKeyBytes,
          timeoutMs: config.timeoutMs,
        });

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No agents found matching: "${args.query}"`,
              },
            ],
          };
        }

        const text = [
          `Found ${results.length} agents:`,
          '',
          ...results.map((r, i) => {
            const cap = r.capabilities[0];
            return [
              `${i + 1}. ${r.did}`,
              `   Description: ${cap?.description || 'N/A'}`,
              `   Tags: ${cap?.tags?.join(', ') || 'N/A'}`,
              `   Trust: ${r.trust?.score?.toFixed(2) || 'N/A'}`,
            ].join('\n');
          }),
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      }

      case 'ainp.send_intent': {
        const params: SendIntentParams = {
          to_did: args.to_did as string,
          intent_type: args.intent_type as string,
          payload: args.payload as Record<string, unknown>,
          subject: args.subject as string | undefined,
          conversation_id: args.conversation_id as string | undefined,
        };

        const result = await sendIntent(params, {
          baseUrl: config.baseUrl,
          did: config.did,
          privateKey: privateKeyBytes,
          timeoutMs: config.timeoutMs,
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Intent sent\nMessage ID: ${result.message_id}\nTo: ${args.to_did}\nType: ${args.intent_type}`,
            },
          ],
        };
      }

      case 'ainp.inbox': {
        const inbox = await getInbox({
          baseUrl: config.baseUrl,
          did: config.did,
          limit: (args.limit as number) || undefined,
          cursor: args.cursor as string | undefined,
          label: args.label as string | undefined,
          unread_only: args.unread_only as boolean | undefined,
          timeoutMs: config.timeoutMs,
        });

        if (inbox.messages.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No messages in inbox',
              },
            ],
          };
        }

        const text = [
          `Inbox (${inbox.messages.length} messages):`,
          '',
          ...inbox.messages.map((m, i) => {
            const unreadMark = m.read ? '  ' : '🔵';
            const subject = m.subject || '(no subject)';
            const from = m.from_did.slice(0, 20) + '...';
            return `${unreadMark} ${i + 1}. ${subject}\n   From: ${from}\n   Received: ${m.received_at}`;
          }),
          '',
          inbox.pagination.has_more
            ? `Has more results. Use cursor: ${inbox.pagination.cursor}`
            : 'End of messages',
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      }

      case 'ainp.thread': {
        const thread = await getThread({
          baseUrl: config.baseUrl,
          did: config.did,
          conversation_id: args.conversation_id as string,
          timeoutMs: config.timeoutMs,
        });

        const text = [
          `Thread: ${thread.conversation_id}`,
          `Participants: ${thread.participants.join(', ')}`,
          `Messages: ${thread.messages.length}`,
          '',
          ...thread.messages.map((m, i) => {
            const from = m.from_did.slice(0, 20) + '...';
            const subject = m.subject || '(no subject)';
            return [
              `--- Message ${i + 1} ---`,
              `From: ${from}`,
              `Subject: ${subject}`,
              `Received: ${m.received_at}`,
              `Body: ${m.body_text.slice(0, 200)}${m.body_text.length > 200 ? '...' : ''}`,
            ].join('\n');
          }),
        ].join('\n\n');

        return {
          content: [{ type: 'text', text }],
        };
      }

      case 'ainp.wallet.balance': {
        const balance = await getBalance({
          baseUrl: config.baseUrl,
          did: config.did,
          timeoutMs: config.timeoutMs,
        });

        // Convert bigint strings to numbers for display
        const balanceCredits = (Number(balance.balance) / 1000).toFixed(3);
        const earnedCredits = (Number(balance.earned) / 1000).toFixed(3);
        const spentCredits = (Number(balance.spent) / 1000).toFixed(3);
        const reservedCredits = (Number(balance.reserved) / 1000).toFixed(3);

        const text = [
          `💰 Credit Balance`,
          '',
          `Available: ${balanceCredits} credits`,
          `Reserved: ${reservedCredits} credits`,
          '',
          `Lifetime Stats:`,
          `  Earned: ${earnedCredits} credits`,
          `  Spent: ${spentCredits} credits`,
          '',
          config.walletAddress
            ? `Wallet: ${config.walletAddress}`
            : 'No wallet configured (use AINP_WALLET_ADDRESS)',
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start event bridge for async notifications
const bridge = new AINPEventBridge(config, server);
bridge.start();

// Start server
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error('Failed to start AINP MCP server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  bridge.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  bridge.stop();
  process.exit(0);
});
