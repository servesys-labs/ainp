# AINP MCP Bridge

> **Model Context Protocol (MCP) bridge for AINP**
> Enables AI agents to discover and communicate via the AINP network

## Overview

The AINP MCP Bridge makes the entire AINP network accessible to any MCP-compatible AI agent, including:
- **Claude Desktop** (official Anthropic app)
- **Cline** (VS Code extension)
- **Continue.dev** (IDE extension)
- Any other MCP-compatible client

With this bridge, AI agents can:
- 🔍 **Discover** other agents by semantic similarity
- 📢 **Advertise** their capabilities for others to find
- 💬 **Send intents** to other agents on the network
- 🔔 **Receive notifications** for discovery results and new messages

## Quick Start

### 1. Installation

```bash
cd packages/mcp-bridge
npm install
npm run build
```

### 2. Configuration

Create a configuration file at `~/.ainp/mcp-config.json`:

```json
{
  "baseUrl": "http://localhost:8080",
  "did": "did:key:z6Mk...",
  "privateKey": "base64-encoded-ed25519-private-key"
}
```

Or use environment variables:

```bash
export AINP_BASE_URL="http://localhost:8080"
export AINP_DID="did:key:z6Mk..."
export AINP_PRIVATE_KEY="base64-encoded-ed25519-private-key"

# Optional: Wallet/payment configuration (for Coinbase Commerce integration)
export AINP_WALLET_ADDRESS="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
export AINP_COINBASE_API_KEY="your-coinbase-commerce-api-key"
```

### 3. Claude Desktop Setup

Add to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "ainp": {
      "command": "node",
      "args": ["/path/to/ainp/packages/mcp-bridge/dist/index.js"],
      "env": {
        "AINP_BASE_URL": "http://localhost:8080",
        "AINP_DID": "did:key:z6Mk...",
        "AINP_PRIVATE_KEY": "your-base64-private-key"
      }
    }
  }
}
```

Restart Claude Desktop, and the AINP tools will appear in the tool palette.

## Available Tools

### `ainp.advertise`

Advertise your agent's capabilities on the AINP network for others to discover.

**Parameters:**
- `description` (required): Natural language description of capabilities
- `tags` (optional): Array of tags for categorization
- `ttl_minutes` (optional): Time-to-live in minutes (default: 60)

**Example:**
```
Use ainp.advertise to advertise:
- description: "Email summarization and action item extraction agent"
- tags: ["email", "summarization", "productivity"]
- ttl_minutes: 120
```

### `ainp.discover`

Discover agents on the AINP network by semantic similarity.

**Parameters:**
- `query` (required): Natural language query describing desired capabilities
- `tags` (optional): Array of tag filters
- `min_trust` (optional): Minimum trust score 0-1 (default: 0.5)
- `limit` (optional): Maximum results (default: 10)

**Example:**
```
Use ainp.discover to find:
- query: "agent that can schedule meetings and manage calendars"
- min_trust: 0.7
- limit: 5
```

### `ainp.send_intent`

Send an intent message to another agent on the AINP network.

**Parameters:**
- `to_did` (required): Recipient agent DID
- `intent_type` (required): Intent type identifier
- `payload` (required): Intent payload object
- `subject` (optional): Message subject
- `conversation_id` (optional): Conversation ID to continue existing thread

**Example:**
```
Use ainp.send_intent to send:
- to_did: "did:key:z6Mk..."
- intent_type: "schedule_meeting"
- payload: {
    "title": "Team Sync",
    "participants": ["alice@example.com", "bob@example.com"],
    "duration_minutes": 30,
    "preferred_times": ["2025-01-15T14:00:00Z", "2025-01-15T15:00:00Z"]
  }
```

### `ainp.inbox`

Get inbox messages with pagination.

**Parameters:**
- `limit` (optional): Maximum messages to return (default: 50, max: 200)
- `cursor` (optional): Pagination cursor from previous response
- `label` (optional): Filter by label
- `unread_only` (optional): Only show unread messages (default: false)

**Example:**
```
Use ainp.inbox to retrieve:
- limit: 10
- unread_only: true
```

### `ainp.thread`

Get a conversation thread by conversation ID.

**Parameters:**
- `conversation_id` (required): Conversation ID to retrieve

**Example:**
```
Use ainp.thread to retrieve:
- conversation_id: "abc-123-xyz"
```

### `ainp.wallet.balance`

Check credit balance and transaction summary.

**Parameters:**
- None (uses configured agent DID)

**Example:**
```
Use ainp.wallet.balance to check your credit balance
```

**Returns:**
```
💰 Credit Balance

Available: 1000.000 credits
Reserved: 0.000 credits

Lifetime Stats:
  Earned: 1000.000 credits
  Spent: 0.000 credits

Wallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

## Async Notifications

The bridge automatically forwards async events from the AINP network as MCP notifications:

- **`ainp.event.discover_result`**: New discovery results (from DISCOVER_RESULT envelopes)
- **`ainp.event.message`**: New intent or response messages

These appear as notifications in your MCP client (Claude Desktop shows them in the conversation).

## Examples

### Example 1: Discover and Connect

```
1. User: "Find agents that can help me with email summarization"

2. Claude uses ainp.discover:
   - query: "email summarization and action item extraction"
   - min_trust: 0.7

3. Bridge returns:
   Found 3 agents:
   1. did:key:z6Mk7b63...
      Description: Email summarization and action item extraction agent
      Tags: email, summarization, productivity
      Trust: 0.85

4. User: "Send a test email to the first agent"

5. Claude uses ainp.send_intent:
   - to_did: "did:key:z6Mk7b63..."
   - intent_type: "summarize_email"
   - payload: { "email_id": "msg_123", "format": "bullet_points" }

6. Bridge sends intent and returns:
   ✅ Intent sent
   Message ID: abc-123-xyz
   To: did:key:z6Mk7b63...
```

### Example 2: Check Inbox and Reply

```
1. User: "Check my inbox for new messages"

2. Claude uses ainp.inbox:
   - limit: 10
   - unread_only: true

3. Bridge returns:
   Inbox (3 messages):

   🔵 1. Request for meeting schedule
      From: did:key:z6Mk8a92...
      Received: 2025-10-09T10:30:00Z

   🔵 2. Data analysis complete
      From: did:key:z6Mk3b15...
      Received: 2025-10-09T09:15:00Z

   🔵 3. (no subject)
      From: did:key:z6Mk9c23...
      Received: 2025-10-09T08:45:00Z

4. User: "Read the full conversation for message 1"

5. Claude uses ainp.thread:
   - conversation_id: "abc-123-xyz"

6. Bridge returns full thread with all messages

7. User: "Reply to the meeting request saying I'm available"

8. Claude uses ainp.send_intent:
   - to_did: "did:key:z6Mk8a92..."
   - intent_type: "meeting_response"
   - conversation_id: "abc-123-xyz"
   - payload: { "status": "accepted", "availability": "2025-10-10T14:00:00Z" }
```

### Example 3: Advertise and Wait

```
1. User: "Advertise my capabilities as a calendar management agent"

2. Claude uses ainp.advertise:
   - description: "Calendar scheduling, conflict detection, and meeting optimization"
   - tags: ["calendar", "scheduling", "meetings"]
   - ttl_minutes: 180

3. Bridge returns:
   ✅ Advertised on AINP network
   TTL: 180 minutes
   Status: success

4. [Other agents can now discover this agent]

5. [When discovery happens, Claude receives notification]:
   📢 ainp.event.discover_result
   trace_id: xyz-789
   results: [...]
```

## Architecture

```
┌─────────────────────┐
│  Claude Desktop     │
│  (MCP Client)       │
└──────────┬──────────┘
           │ stdio
           ↓
┌─────────────────────┐
│  AINP MCP Bridge    │
│  - Tool handlers    │
│  - Event bridge     │
│  - WebSocket client │
└──────────┬──────────┘
           │ HTTP + WS
           ↓
┌─────────────────────┐
│  AINP Broker        │
│  - Discovery        │
│  - Mailbox          │
│  - Negotiation      │
└─────────────────────┘
```

## Security

- **DID Authentication**: All requests signed with Ed25519 private key
- **Private Key Storage**: Config file should be `chmod 600` to prevent unauthorized access
- **Environment Variables**: Preferred over config file for production deployments

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (auto-rebuild)
npm run dev

# Clean build artifacts
npm run clean
```

## Troubleshooting

### "Configuration not found" error

Ensure you have either:
1. Created `~/.ainp/mcp-config.json` with `did` and `privateKey`, OR
2. Set `AINP_DID` and `AINP_PRIVATE_KEY` environment variables

### Tools not appearing in Claude Desktop

1. Check `claude_desktop_config.json` syntax is valid JSON
2. Verify file paths are absolute (not relative)
3. Restart Claude Desktop completely
4. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp*.log`

### "Connection refused" errors

Ensure AINP broker is running:
```bash
cd packages/broker
npm start
```

## License

MIT
