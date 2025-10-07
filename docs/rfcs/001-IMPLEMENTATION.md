# RFC 001: AINP Implementation Guide

**Status**: Informational
**Authors**: AINP Working Group
**Created**: 2025-10-06
**Related**: RFC 001-SPEC, RFC 001-RATIONALE

## Abstract

This document provides a step-by-step implementation guide for building AINP-compatible agents, brokers, and discovery services. It includes code examples in TypeScript and Python, testing strategies, and debugging tips.

**Target Audience**: SDK users, agent developers, infrastructure engineers

## 1. Quick Start

### 1.1 Prerequisites

**Required**:
- Node.js ≥18 or Python ≥3.10
- OpenAI API key (for embeddings)
- Basic understanding of JSON-LD and DIDs

**Optional**:
- Redis (for caching)
- PostgreSQL (for discovery index)

### 1.2 Hello World: Send an Intent

**TypeScript**:
```typescript
import { AINPClient, RequestMeetingIntent } from '@ainp/sdk'

const client = new AINPClient({
  did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  privateKey: 'base64-encoded-ed25519-private-key',
  discoveryUrl: 'wss://discovery.ainp.dev'
})

// Create intent
const intent: RequestMeetingIntent = {
  "@context": "https://ainp.dev/contexts/meeting/v1",
  "@type": "RequestMeeting",
  version: "1.0.0",
  embedding: await client.embed("Schedule a meeting tomorrow at 2pm"),
  semantics: {
    participants: [
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
    ],
    duration_minutes: 30,
    preferred_times: ['2025-10-07T14:00:00Z'],
    location: 'virtual',
    constraints: {
      timezone: 'America/Los_Angeles',
      max_latency_ms: 5000,
      min_notice_hours: 24
    }
  },
  budget: {
    max_credits: 10,
    max_rounds: 5,
    timeout_ms: 30000
  }
}

// Send intent
const result = await client.sendIntent(intent, {
  to_query: {
    description: "Find agents who can schedule meetings",
    tags: ["scheduling", "calendar"],
    min_trust: 0.7
  },
  qos: {
    urgency: 0.7,
    importance: 0.8,
    novelty: 0.1,
    ethicalWeight: 0.5,
    bid: 5
  }
})

console.log('Meeting scheduled:', result)
```

**Python**:
```python
from ainp import AINPClient, RequestMeetingIntent
import asyncio

async def main():
    client = AINPClient(
        did='did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        private_key='base64-encoded-ed25519-private-key',
        discovery_url='wss://discovery.ainp.dev'
    )

    # Create intent
    intent = RequestMeetingIntent(
        context="https://ainp.dev/contexts/meeting/v1",
        type="RequestMeeting",
        version="1.0.0",
        embedding=await client.embed("Schedule a meeting tomorrow at 2pm"),
        semantics={
            'participants': [
                'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
            ],
            'duration_minutes': 30,
            'preferred_times': ['2025-10-07T14:00:00Z'],
            'location': 'virtual',
            'constraints': {
                'timezone': 'America/Los_Angeles',
                'max_latency_ms': 5000,
                'min_notice_hours': 24
            }
        },
        budget={
            'max_credits': 10,
            'max_rounds': 5,
            'timeout_ms': 30000
        }
    )

    # Send intent
    result = await client.send_intent(intent, to_query={
        'description': "Find agents who can schedule meetings",
        'tags': ["scheduling", "calendar"],
        'min_trust': 0.7
    }, qos={
        'urgency': 0.7,
        'importance': 0.8,
        'novelty': 0.1,
        'ethicalWeight': 0.5,
        'bid': 5
    })

    print('Meeting scheduled:', result)

asyncio.run(main())
```

## 2. Setting Up an Agent

### 2.1 Generate DID and Keys

**TypeScript**:
```typescript
import { generateKeyPair } from '@ainp/crypto'
import { createDID } from '@ainp/did'

// Generate Ed25519 key pair
const { publicKey, privateKey } = generateKeyPair()

// Create did:key
const did = createDID(publicKey)
// Output: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK

console.log('DID:', did)
console.log('Private Key (save securely):', privateKey.toString('base64'))
```

**Python**:
```python
from ainp.crypto import generate_keypair
from ainp.did import create_did

# Generate Ed25519 key pair
public_key, private_key = generate_keypair()

# Create did:key
did = create_did(public_key)
# Output: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK

print(f'DID: {did}')
print(f'Private Key (save securely): {private_key.hex()}')
```

### 2.2 Define Capabilities

```typescript
import { embed } from '@ainp/embeddings'

const capabilities = [
  {
    description: "Schedule meetings with calendar integration",
    embedding: await embed("Schedule meetings with calendar integration"),
    tags: ["scheduling", "calendar", "meeting"],
    version: "1.0.0",
    evidence: "https://credentials.example.com/vc/scheduling-cert"
  },
  {
    description: "Process insurance claims with 95% accuracy",
    embedding: await embed("Process insurance claims with 95% accuracy"),
    tags: ["insurance", "claims", "processing"],
    version: "1.2.0",
    evidence: "https://credentials.example.com/vc/insurance-license"
  }
]
```

### 2.3 Create Semantic Address

```typescript
import { SemanticAddress, TrustVector } from '@ainp/types'

const address: SemanticAddress = {
  did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
  capabilities: capabilities,
  trust: {
    score: 0.85,
    dimensions: {
      reliability: 0.9,
      honesty: 0.85,
      competence: 0.8,
      timeliness: 0.85
    },
    decay_rate: 0.977,  // 30-day half-life
    last_updated: Date.now()
  },
  credentials: [
    "https://credentials.example.com/vc/scheduling-cert",
    "https://credentials.example.com/vc/insurance-license"
  ]
}
```

### 2.4 Advertise Capabilities

```typescript
import { AINPAgent } from '@ainp/sdk'

const agent = new AINPAgent({
  did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
  privateKey: 'base64-private-key',
  address: address,
  discoveryUrl: 'wss://discovery.ainp.dev'
})

// Advertise to discovery index
await agent.advertise({
  ttl: 86400000,  // 24 hours
  qos: {
    urgency: 0.1,
    importance: 0.5,
    novelty: 0.3,
    ethicalWeight: 0.5,
    bid: 0
  }
})

console.log('Capabilities advertised to discovery index')
```

## 3. Handling Intents

### 3.1 Register Intent Handler

```typescript
agent.onIntent('RequestMeeting', async (envelope, intent) => {
  console.log('Received meeting request:', intent)

  // Extract meeting details
  const { participants, duration_minutes, preferred_times } = intent.semantics

  // Check availability (pseudo-code)
  const availability = await checkCalendar(participants, preferred_times)

  if (availability.length === 0) {
    // Send error response
    return {
      msg_type: 'ERROR',
      error_code: 'NO_AVAILABILITY',
      error_message: 'No time slots available',
      intent_id: envelope.id
    }
  }

  // Schedule meeting
  const scheduledTime = availability[0]
  const meetingId = await createMeeting({
    participants,
    time: scheduledTime,
    duration: duration_minutes
  })

  // Send result
  return {
    msg_type: 'RESULT',
    status: 'success',
    result: {
      meeting_scheduled: true,
      confirmed_time: scheduledTime,
      calendar_link: `https://calendar.example.com/events/${meetingId}`
    },
    attestations: [
      'https://credentials.example.com/vc/meeting-proof'
    ],
    metadata: {
      processing_time_ms: 250,
      confidence: 0.95
    }
  }
})
```

### 3.2 Multi-Intent Handler

```typescript
// Handle multiple intent types
agent.onIntent('ApprovalRequest', handleApproval)
agent.onIntent('SubmitInfo', handleDataSubmission)
agent.onIntent('Invoice', handleInvoice)
agent.onIntent('FreeformNote', handleNote)

async function handleApproval(envelope, intent) {
  // Approval logic
}

async function handleDataSubmission(envelope, intent) {
  // Data processing logic
}

async function handleInvoice(envelope, intent) {
  // Payment processing logic
}

async function handleNote(envelope, intent) {
  // Message handling logic
}
```

## 4. Negotiation

### 4.1 Responding to Negotiation

```typescript
agent.onNegotiate(async (envelope, message) => {
  const { phase, proposal, round, negotiation_id } = message

  if (phase === 'OFFER') {
    // Evaluate offer
    const { price, latency_ms, confidence } = proposal

    // Accept if terms are good
    if (price >= 5 && latency_ms <= 10000 && confidence >= 0.9) {
      return {
        phase: 'ACCEPT',
        negotiation_id,
        round: round + 1,
        proposal: proposal
      }
    }

    // Counter-offer
    return {
      phase: 'COUNTER',
      negotiation_id,
      round: round + 1,
      proposal: {
        price: Math.max(5, price * 0.9),  // Lower price by 10%
        latency_ms: latency_ms * 1.1,     // Increase latency allowance
        confidence: 0.95,
        privacy: 'encrypted',
        terms: { sla: '99.9% uptime' }
      },
      constraints: message.constraints
    }
  }

  if (phase === 'COUNTER') {
    // Evaluate counter-offer
    const convergence = 1 - Math.abs(proposal.price - 5) / Math.max(proposal.price, 5)

    if (convergence >= 0.9) {
      return {
        phase: 'ACCEPT',
        negotiation_id,
        round: round + 1,
        proposal: proposal
      }
    }

    // Abort if too many rounds
    if (round >= 10) {
      return {
        phase: 'ABORT',
        negotiation_id,
        round: round + 1,
        proposal: null
      }
    }

    // Continue negotiation
    return {
      phase: 'COUNTER',
      negotiation_id,
      round: round + 1,
      proposal: {
        price: (proposal.price + 5) / 2,  // Split the difference
        latency_ms: proposal.latency_ms,
        confidence: proposal.confidence,
        privacy: proposal.privacy,
        terms: proposal.terms
      },
      constraints: message.constraints
    }
  }

  if (phase === 'ACCEPT') {
    console.log('Negotiation accepted:', proposal)
    return null  // No response needed
  }

  if (phase === 'REJECT' || phase === 'ABORT') {
    console.log('Negotiation ended:', phase)
    return null
  }
})
```

### 4.2 Initiating Negotiation

```typescript
const negotiation = await client.negotiate({
  to_did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
  proposal: {
    price: 5,
    latency_ms: 5000,
    confidence: 0.9,
    privacy: 'encrypted',
    terms: {}
  },
  constraints: {
    max_rounds: 10,
    timeout_per_round_ms: 5000,
    convergence_threshold: 0.9
  }
})

if (negotiation.phase === 'ACCEPT') {
  console.log('Negotiation successful:', negotiation.proposal)
  // Proceed to send intent
} else {
  console.log('Negotiation failed:', negotiation.phase)
}
```

## 5. Discovery

### 5.1 Querying Discovery Index

```typescript
const matches = await client.discover({
  description: "Find agents who can process insurance claims",
  embedding: await client.embed("process insurance claims"),
  tags: ["insurance", "claims"],
  min_trust: 0.7,
  max_latency_ms: 5000,
  max_cost: 10
})

console.log(`Found ${matches.length} matching agents:`)
matches.forEach(match => {
  console.log(`- ${match.did} (trust: ${match.trust.score}, similarity: ${match.similarity})`)
})
```

### 5.2 Similarity Scoring

```typescript
import { cosineSimilarity } from '@ainp/embeddings'

function scoreAgents(queryEmbedding: Float32Array, agents: Agent[]) {
  return agents.map(agent => {
    // Find best matching capability
    const similarities = agent.capabilities.map(cap =>
      cosineSimilarity(queryEmbedding, decodeEmbedding(cap.embedding))
    )
    const maxSimilarity = Math.max(...similarities)

    // Combine similarity and trust
    const score = (maxSimilarity * 0.7) + (agent.trust.score * 0.3)

    return { agent, similarity: maxSimilarity, score }
  })
  .filter(({ similarity }) => similarity >= 0.7)
  .sort((a, b) => b.score - a.score)
}
```

## 6. Signing and Verification

### 6.1 Signing Messages

```typescript
import { signEnvelope } from '@ainp/crypto'
import { canonicalize } from 'json-canonicalize'

function createSignedEnvelope(envelope: AINPEnvelope, privateKey: Buffer): AINPEnvelope {
  // Remove sig field if present
  const { sig, ...unsignedEnvelope } = envelope

  // Canonicalize JSON
  const canonical = canonicalize(unsignedEnvelope)

  // Sign
  const signature = signEnvelope(canonical, privateKey)

  // Add signature
  return {
    ...unsignedEnvelope,
    sig: signature.toString('base64')
  }
}
```

### 6.2 Verifying Messages

```typescript
import { verifyEnvelope } from '@ainp/crypto'
import { resolveDID } from '@ainp/did'

async function verifySignedEnvelope(envelope: AINPEnvelope): Promise<boolean> {
  // Extract signature
  const { sig, ...unsignedEnvelope } = envelope

  // Resolve DID to get public key
  const didDocument = await resolveDID(envelope.from_did)
  const publicKey = didDocument.verificationMethod[0].publicKeyBase58

  // Canonicalize
  const canonical = canonicalize(unsignedEnvelope)

  // Verify
  return verifyEnvelope(canonical, Buffer.from(sig, 'base64'), publicKey)
}
```

## 7. Embeddings

### 7.1 Generating Embeddings

```typescript
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function embed(text: string): Promise<string> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  })

  const embedding = response.data[0].embedding  // 1536 floats

  // Encode as Float32Array
  const float32 = new Float32Array(embedding)

  // Convert to base64
  const bytes = new Uint8Array(float32.buffer)
  return Buffer.from(bytes).toString('base64')
}

// Decode embedding
function decodeEmbedding(base64: string): Float32Array {
  const bytes = Buffer.from(base64, 'base64')
  return new Float32Array(bytes.buffer)
}
```

### 7.2 Cosine Similarity

```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
```

## 8. Trust Management

### 8.1 Updating Trust Scores

```typescript
function updateTrustScore(trust: TrustVector, outcome: {
  success: boolean,
  latency_ms: number,
  expected_latency_ms: number
}): TrustVector {
  const now = Date.now()
  const daysSinceUpdate = (now - trust.last_updated) / (1000 * 60 * 60 * 24)

  // Apply decay
  const decayedScore = trust.score * Math.pow(trust.decay_rate, daysSinceUpdate)

  // Update dimensions based on outcome
  const reliability = outcome.success ? 0.95 : 0.5
  const timeliness = Math.max(0, 1 - (outcome.latency_ms / outcome.expected_latency_ms - 1))

  // Exponential moving average (alpha = 0.2)
  const alpha = 0.2
  const newDimensions = {
    reliability: (1 - alpha) * trust.dimensions.reliability + alpha * reliability,
    honesty: trust.dimensions.honesty,  // Updated via peer reviews
    competence: trust.dimensions.competence,  // Updated via quality metrics
    timeliness: (1 - alpha) * trust.dimensions.timeliness + alpha * timeliness
  }

  // Recalculate score
  const newScore = (
    newDimensions.reliability * 0.35 +
    newDimensions.honesty * 0.35 +
    newDimensions.competence * 0.20 +
    newDimensions.timeliness * 0.10
  )

  return {
    score: newScore,
    dimensions: newDimensions,
    decay_rate: trust.decay_rate,
    last_updated: now
  }
}
```

## 9. Error Handling

### 9.1 Sending Error Responses

```typescript
agent.onIntent('RequestMeeting', async (envelope, intent) => {
  try {
    // Process intent
    const result = await scheduleMeeting(intent)
    return { msg_type: 'RESULT', status: 'success', result }
  } catch (error) {
    // Send error response
    return {
      msg_type: 'ERROR',
      error_code: error.code || 'INTERNAL_ERROR',
      error_message: error.message,
      intent_id: envelope.id,
      retry_after_ms: error.retryable ? 5000 : undefined
    }
  }
})
```

### 9.2 Error Codes

```typescript
enum ErrorCode {
  // Client errors (4xx)
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',

  // Negotiation errors
  NEGOTIATION_TIMEOUT = 'NEGOTIATION_TIMEOUT',
  NEGOTIATION_ABORTED = 'NEGOTIATION_ABORTED',
  NO_AGREEMENT = 'NO_AGREEMENT',

  // Discovery errors
  NO_AGENTS_FOUND = 'NO_AGENTS_FOUND',
  DISCOVERY_TIMEOUT = 'DISCOVERY_TIMEOUT'
}
```

## 10. Testing

### 10.1 Unit Tests

```typescript
import { describe, it, expect } from 'vitest'
import { cosineSimilarity, embed } from '@ainp/embeddings'

describe('Embeddings', () => {
  it('should generate embeddings with correct dimensions', async () => {
    const embedding = await embed('test message')
    const decoded = decodeEmbedding(embedding)
    expect(decoded.length).toBe(1536)
  })

  it('should compute cosine similarity correctly', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    const similarity = cosineSimilarity(a, b)
    expect(similarity).toBeCloseTo(0, 5)
  })

  it('should return 1 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2, 3])
    const similarity = cosineSimilarity(a, b)
    expect(similarity).toBeCloseTo(1, 5)
  })
})
```

### 10.2 Integration Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { AINPAgent, AINPClient } from '@ainp/sdk'

describe('AINP Integration', () => {
  let agent: AINPAgent
  let client: AINPClient

  beforeAll(async () => {
    // Setup test agent
    agent = new AINPAgent({
      did: 'did:key:test-agent',
      privateKey: 'test-private-key',
      address: testAddress,
      discoveryUrl: 'ws://localhost:8080'
    })

    await agent.advertise()
    await agent.start()

    // Setup test client
    client = new AINPClient({
      did: 'did:key:test-client',
      privateKey: 'test-private-key',
      discoveryUrl: 'ws://localhost:8080'
    })
  })

  afterAll(async () => {
    await agent.stop()
  })

  it('should send and receive intent', async () => {
    const intent = createTestIntent('RequestMeeting')
    const result = await client.sendIntent(intent, {
      to_did: 'did:key:test-agent'
    })

    expect(result.msg_type).toBe('RESULT')
    expect(result.status).toBe('success')
  })

  it('should negotiate successfully', async () => {
    const negotiation = await client.negotiate({
      to_did: 'did:key:test-agent',
      proposal: { price: 5, latency_ms: 5000, confidence: 0.9 }
    })

    expect(negotiation.phase).toBe('ACCEPT')
  })

  it('should discover agents by capability', async () => {
    const matches = await client.discover({
      description: 'Schedule meetings',
      tags: ['scheduling']
    })

    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].did).toBe('did:key:test-agent')
  })
})
```

## 11. Debugging

### 11.1 Logging

```typescript
import { Logger } from '@ainp/logger'

const logger = new Logger({
  level: 'debug',
  format: 'json',
  output: 'stdout'
})

agent.on('intent', (envelope) => {
  logger.debug('Intent received', {
    trace_id: envelope.trace_id,
    intent_id: envelope.id,
    from_did: envelope.from_did,
    msg_type: envelope.msg_type
  })
})

agent.on('result', (envelope) => {
  logger.info('Result sent', {
    trace_id: envelope.trace_id,
    intent_id: envelope.id,
    status: 'success'
  })
})

agent.on('error', (error) => {
  logger.error('Error occurred', {
    error_code: error.code,
    error_message: error.message,
    stack: error.stack
  })
})
```

### 11.2 Tracing

```typescript
import { Tracer } from '@ainp/tracing'

const tracer = new Tracer({
  serviceName: 'my-agent',
  endpoint: 'http://jaeger:14268/api/traces'
})

agent.onIntent('RequestMeeting', async (envelope, intent) => {
  const span = tracer.startSpan('process_meeting_request', {
    trace_id: envelope.trace_id,
    intent_id: envelope.id
  })

  try {
    const result = await scheduleMeeting(intent)
    span.setTag('status', 'success')
    return { msg_type: 'RESULT', status: 'success', result }
  } catch (error) {
    span.setTag('status', 'error')
    span.setTag('error', error.message)
    throw error
  } finally {
    span.finish()
  }
})
```

### 11.3 Debugging Checklist

**Message not received?**
- ✅ Check signature verification (use `verifySignedEnvelope()`)
- ✅ Verify DID is resolvable
- ✅ Check TTL (expired messages are dropped)
- ✅ Verify agent is advertised in discovery index
- ✅ Check rate limits

**Negotiation failing?**
- ✅ Check convergence threshold (default 0.9)
- ✅ Verify max_rounds not exceeded (default 10)
- ✅ Check timeout_per_round_ms (default 5000)
- ✅ Log proposal values (price, latency, confidence)

**Discovery returns no results?**
- ✅ Check embedding generation (1536 dimensions)
- ✅ Verify tags match (case-sensitive)
- ✅ Lower min_trust threshold (default 0.7)
- ✅ Check capability embeddings (cosine similarity ≥ 0.7)

**Trust score incorrect?**
- ✅ Verify decay applied (30-day half-life)
- ✅ Check last_updated timestamp
- ✅ Recalculate score formula
- ✅ Verify dimension updates (reliability, honesty, competence, timeliness)

## 12. Performance Optimization

### 12.1 Embedding Caching

```typescript
import { createHash } from 'crypto'

class EmbeddingCache {
  private cache = new Map<string, string>()

  async embed(text: string): Promise<string> {
    const hash = createHash('sha256').update(text).digest('hex')

    if (this.cache.has(hash)) {
      return this.cache.get(hash)!
    }

    const embedding = await generateEmbedding(text)
    this.cache.set(hash, embedding)
    return embedding
  }
}

const cache = new EmbeddingCache()
const embedding = await cache.embed("Schedule a meeting")  // Cached on repeat
```

### 12.2 Batch Processing

```typescript
async function batchEmbed(texts: string[]): Promise<string[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts  // Batch request
  })

  return response.data.map(({ embedding }) => {
    const float32 = new Float32Array(embedding)
    const bytes = new Uint8Array(float32.buffer)
    return Buffer.from(bytes).toString('base64')
  })
}

// Usage
const embeddings = await batchEmbed([
  "Schedule a meeting",
  "Process insurance claim",
  "Approve purchase order"
])
```

### 12.3 Connection Pooling

```typescript
import WebSocket from 'ws'

class WebSocketPool {
  private pool: WebSocket[] = []
  private size = 10

  async getConnection(url: string): Promise<WebSocket> {
    if (this.pool.length > 0) {
      return this.pool.pop()!
    }

    return new WebSocket(url)
  }

  releaseConnection(ws: WebSocket) {
    if (this.pool.length < this.size) {
      this.pool.push(ws)
    } else {
      ws.close()
    }
  }
}
```

## 13. Security Best Practices

### 13.1 Key Management

**DO**:
- ✅ Store private keys in secure key stores (HashiCorp Vault, AWS KMS)
- ✅ Use environment variables for keys (never commit to git)
- ✅ Rotate keys periodically (every 90 days)
- ✅ Use different keys for dev/staging/prod

**DON'T**:
- ❌ Hard-code private keys in source code
- ❌ Share keys via insecure channels (email, Slack)
- ❌ Use same key for multiple agents
- ❌ Store keys in plain text files

### 13.2 Rate Limiting

```typescript
import ratelimit from 'express-rate-limit'

const limiter = ratelimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests per minute
  message: {
    msg_type: 'ERROR',
    error_code: 'RATE_LIMIT_EXCEEDED',
    error_message: 'Too many requests',
    retry_after_ms: 60000
  },
  keyGenerator: (envelope) => envelope.from_did  // Limit per DID
})

agent.use(limiter)
```

### 13.3 Input Validation

```typescript
import Ajv from 'ajv'

const ajv = new Ajv()

const intentSchema = {
  type: 'object',
  required: ['@context', '@type', 'version', 'embedding', 'semantics', 'budget'],
  properties: {
    '@context': { type: 'string', format: 'uri' },
    '@type': { type: 'string' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    embedding: { type: 'string' },
    semantics: { type: 'object' },
    budget: {
      type: 'object',
      required: ['max_credits', 'max_rounds', 'timeout_ms'],
      properties: {
        max_credits: { type: 'number', minimum: 0 },
        max_rounds: { type: 'integer', minimum: 1, maximum: 10 },
        timeout_ms: { type: 'integer', minimum: 1000, maximum: 60000 }
      }
    }
  }
}

const validateIntent = ajv.compile(intentSchema)

agent.onIntent('*', async (envelope, intent) => {
  if (!validateIntent(intent)) {
    return {
      msg_type: 'ERROR',
      error_code: 'INVALID_SCHEMA',
      error_message: ajv.errorsText(validateIntent.errors),
      intent_id: envelope.id
    }
  }

  // Process valid intent
})
```

## 14. Deployment

### 14.1 Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

ENV NODE_ENV=production
ENV AINP_DID=did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH
ENV AINP_PRIVATE_KEY=base64-private-key
ENV AINP_DISCOVERY_URL=wss://discovery.ainp.dev
ENV OPENAI_API_KEY=sk-proj-...

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### 14.2 Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ainp-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ainp-agent
  template:
    metadata:
      labels:
        app: ainp-agent
    spec:
      containers:
      - name: agent
        image: myregistry/ainp-agent:latest
        env:
        - name: AINP_DID
          valueFrom:
            secretKeyRef:
              name: ainp-secrets
              key: did
        - name: AINP_PRIVATE_KEY
          valueFrom:
            secretKeyRef:
              name: ainp-secrets
              key: private-key
        - name: AINP_DISCOVERY_URL
          value: "wss://discovery.ainp.dev"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secrets
              key: api-key
        ports:
        - containerPort: 8080
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## 15. Monitoring

### 15.1 Metrics

```typescript
import { Counter, Histogram, Gauge } from 'prom-client'

const intentsReceived = new Counter({
  name: 'ainp_intents_received_total',
  help: 'Total number of intents received',
  labelNames: ['intent_type']
})

const intentLatency = new Histogram({
  name: 'ainp_intent_latency_seconds',
  help: 'Intent processing latency',
  labelNames: ['intent_type'],
  buckets: [0.1, 0.5, 1, 2, 5]
})

const trustScore = new Gauge({
  name: 'ainp_trust_score',
  help: 'Current trust score',
  labelNames: ['dimension']
})

agent.onIntent('*', async (envelope, intent) => {
  intentsReceived.inc({ intent_type: intent['@type'] })

  const start = Date.now()
  const result = await processIntent(envelope, intent)
  const duration = (Date.now() - start) / 1000

  intentLatency.observe({ intent_type: intent['@type'] }, duration)

  return result
})

// Update trust metrics
setInterval(() => {
  trustScore.set({ dimension: 'reliability' }, agent.trust.dimensions.reliability)
  trustScore.set({ dimension: 'honesty' }, agent.trust.dimensions.honesty)
  trustScore.set({ dimension: 'competence' }, agent.trust.dimensions.competence)
  trustScore.set({ dimension: 'timeliness' }, agent.trust.dimensions.timeliness)
}, 10000)
```

### 15.2 Health Checks

```typescript
import express from 'express'

const app = express()

app.get('/health', (req, res) => {
  const health = {
    status: agent.isRunning() ? 'healthy' : 'unhealthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    trust_score: agent.trust.score,
    intents_processed: agent.stats.intents_processed,
    negotiation_success_rate: agent.stats.negotiation_success_rate
  }

  const statusCode = health.status === 'healthy' ? 200 : 503
  res.status(statusCode).json(health)
})

app.listen(8080)
```

## 16. Resources

### 16.1 Reference Implementations

- **TypeScript SDK**: https://github.com/ainp/sdk-typescript
- **Python SDK**: https://github.com/ainp/sdk-python
- **Discovery Service**: https://github.com/ainp/discovery
- **Example Agents**: https://github.com/ainp/examples

### 16.2 Tools

- **DID Resolver**: https://dev.uniresolver.io/
- **VC Validator**: https://validator.w3.org/vc/
- **Embedding API**: https://platform.openai.com/docs/guides/embeddings
- **JSON-LD Playground**: https://json-ld.org/playground/

### 16.3 Documentation

- **AINP Spec**: https://ainp.dev/rfcs/001-SPEC
- **AINP Rationale**: https://ainp.dev/rfcs/001-RATIONALE
- **W3C DID**: https://www.w3.org/TR/did-core/
- **W3C VC**: https://www.w3.org/TR/vc-data-model/
- **JSON-LD**: https://www.w3.org/TR/json-ld11/

### 16.4 Community

- **Discord**: https://discord.gg/ainp
- **Forum**: https://forum.ainp.dev
- **GitHub**: https://github.com/ainp
- **Twitter**: https://twitter.com/ainp_protocol

---

**End of Implementation Guide**

**Next Steps**:
1. Clone reference implementation: `git clone https://github.com/ainp/sdk-typescript`
2. Follow Quick Start (Section 1.2)
3. Build your first agent (Section 2)
4. Join Discord for support

**Happy building!** 🚀
