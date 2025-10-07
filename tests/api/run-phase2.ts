#!/usr/bin/env node
/**
 * Phase 2: Core API Testing
 * Tests all broker API endpoints with valid inputs, edge cases, and error scenarios
 */

import * as crypto from 'crypto';

interface TestResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
}

const results: TestResult[] = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

const API_BASE = 'http://localhost:8080';

async function runTest(id: string, name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  totalTests++;

  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ id, name, status: 'PASS', duration });
    passedTests++;
    console.log(`✅ ${id}: ${name} (${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    results.push({ id, name, status: 'FAIL', duration, error: error.message });
    failedTests++;
    console.log(`❌ ${id}: ${name} (${duration}ms)`);
    console.log(`   Error: ${error.message}`);
  }
}

// Helper: Generate test DID
function generateTestDID(): string {
  const id = crypto.randomBytes(16).toString('hex');
  return `did:key:z6Mk${id}`;
}

// Helper: Get test embedding (dummy 1536-dim vector)
async function getTestEmbedding(text: string): Promise<number[]> {
  // Use OpenAI API for real embedding
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API failed: ${response.status}`);
  }

  const data: any = await response.json();
  return data.data[0].embedding;
}

async function main() {
  console.log('='.repeat(80));
  console.log('PHASE 2: CORE API TESTING');
  console.log('='.repeat(80));
  console.log();

  // Section 2.1: Health Endpoints
  console.log('2.1 Health Endpoints');
  console.log('-'.repeat(40));

  await runTest('HEALTH-001', 'Test /health endpoint', async () => {
    const response = await fetch(`${API_BASE}/health`);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const data: any = await response.json();
    if (data.status !== 'healthy' || !data.timestamp || data.uptime === undefined) {
      throw new Error('Invalid health response structure');
    }
  });

  await runTest('HEALTH-002', 'Test /health/ready endpoint - all healthy', async () => {
    const response = await fetch(`${API_BASE}/health/ready`);
    const data: any = await response.json();

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}. Response: ${JSON.stringify(data)}`);
    }

    if (!data.checks || !data.checks.database || !data.checks.redis || !data.checks.nats) {
      throw new Error('Missing health check components');
    }
  });

  console.log();

  // Section 2.2: Agent Registration
  console.log('2.2 Agent Registration');
  console.log('-'.repeat(40));

  const testDID1 = generateTestDID();
  let registeredAgentId: string;

  await runTest('REG-001', 'Register agent successfully', async () => {
    const embedding = await getTestEmbedding('Schedule meetings and manage calendar events');

    const payload = {
      did: testDID1,
      publicKey: 'test-public-key-' + Date.now(),
      capabilities: [
        {
          description: 'Schedule meetings and manage calendar events',
          embedding: embedding,
          tags: ['calendar', 'scheduling', 'meetings'],
          version: '1.0.0',
          evidenceVC: 'https://example.com/calendar-agent'
        }
      ],
      ttl: 3600
    };

    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200, got ${response.status}. Response: ${text}`);
    }

    const data: any = await response.json();
    if (!data.id || data.did !== testDID1) {
      throw new Error('Invalid registration response');
    }

    registeredAgentId = data.id;
  });

  await runTest('REG-002', 'Register agent with multiple capabilities', async () => {
    const testDID2 = generateTestDID();
    const embedding1 = await getTestEmbedding('Schedule meetings');
    const embedding2 = await getTestEmbedding('Process payment transactions');

    const payload = {
      did: testDID2,
      publicKey: 'test-public-key-' + Date.now(),
      capabilities: [
        {
          description: 'Schedule meetings',
          embedding: embedding1,
          tags: ['calendar'],
          version: '1.0.0'
        },
        {
          description: 'Process payment transactions',
          embedding: embedding2,
          tags: ['payment', 'transactions'],
          version: '1.0.0'
        }
      ],
      ttl: 3600
    };

    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200, got ${response.status}. Response: ${text}`);
    }

    const data: any = await response.json();
    if (!data.id) {
      throw new Error('Invalid registration response');
    }
  });

  await runTest('REG-003', 'Test duplicate registration (idempotent)', async () => {
    const embedding = await getTestEmbedding('Schedule meetings');

    const payload = {
      did: testDID1, // Reuse same DID
      publicKey: 'updated-public-key',
      capabilities: [
        {
          description: 'Schedule meetings and manage calendar events',
          embedding: embedding,
          tags: ['calendar'],
          version: '1.0.0'
        }
      ],
      ttl: 3600
    };

    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200 (idempotent), got ${response.status}. Response: ${text}`);
    }
  });

  await runTest('REG-004', 'Test invalid DID format', async () => {
    const payload = {
      did: 'invalid-did-format',
      publicKey: 'test-key',
      capabilities: [],
      ttl: 3600
    };

    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }
  });

  await runTest('REG-005', 'Test missing required fields', async () => {
    const payload = {
      did: generateTestDID(),
      publicKey: 'test-key'
      // Missing capabilities
    };

    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }
  });

  console.log();

  // Section 2.3: Agent Retrieval
  console.log('2.3 Agent Retrieval');
  console.log('-'.repeat(40));

  await runTest('GET-001', 'Retrieve registered agent', async () => {
    const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(testDID1)}`);

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200, got ${response.status}. Response: ${text}`);
    }

    const data: any = await response.json();
    if (data.did !== testDID1) {
      throw new Error('DID mismatch in retrieved agent');
    }
    if (!data.capabilities || data.capabilities.length === 0) {
      throw new Error('Missing capabilities in retrieved agent');
    }
  });

  await runTest('GET-002', 'Retrieve non-existent agent', async () => {
    const nonExistentDID = generateTestDID();
    const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(nonExistentDID)}`);

    if (response.status !== 404) {
      throw new Error(`Expected 404, got ${response.status}`);
    }
  });

  await runTest('GET-003', 'Test malformed DID parameter', async () => {
    const response = await fetch(`${API_BASE}/api/agents/not-a-did`);

    if (response.status !== 400 && response.status !== 404) {
      throw new Error(`Expected 400 or 404, got ${response.status}`);
    }
  });

  console.log();

  // Section 2.4: Semantic Discovery
  console.log('2.4 Semantic Discovery');
  console.log('-'.repeat(40));

  await runTest('DISC-001', 'Search with semantic description only', async () => {
    const payload = {
      description: 'I need an agent to schedule a meeting for tomorrow at 2pm',
      tags: [],
      minTrust: 0.0,
      maxLatency: 10000,
      maxCost: 1.0
    };

    const response = await fetch(`${API_BASE}/api/discovery/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200, got ${response.status}. Response: ${text}`);
    }

    const data: any = await response.json();
    if (!Array.isArray(data.agents)) {
      throw new Error('Invalid response structure: missing agents array');
    }
  });

  await runTest('DISC-002', 'Search with tag filters', async () => {
    const payload = {
      description: 'calendar management',
      tags: ['calendar'],
      minTrust: 0.0
    };

    const response = await fetch(`${API_BASE}/api/discovery/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200, got ${response.status}. Response: ${text}`);
    }

    const data: any = await response.json();
    if (!Array.isArray(data.agents)) {
      throw new Error('Invalid response structure');
    }
  });

  await runTest('DISC-003', 'Search with no results', async () => {
    const payload = {
      description: 'Build a spaceship to Mars',
      tags: [],
      minTrust: 0.99
    };

    const response = await fetch(`${API_BASE}/api/discovery/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const data: any = await response.json();
    if (!Array.isArray(data.agents)) {
      throw new Error('Invalid response structure');
    }
  });

  await runTest('DISC-004', 'Search with empty description', async () => {
    const payload = {
      description: '',
      tags: ['calendar']
    };

    const response = await fetch(`${API_BASE}/api/discovery/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Should either work (tag-based) or reject (400)
    if (response.status !== 200 && response.status !== 400) {
      throw new Error(`Expected 200 or 400, got ${response.status}`);
    }
  });

  console.log();

  // Section 2.5: Intent Routing
  console.log('2.5 Intent Routing');
  console.log('-'.repeat(40));

  await runTest('ROUTE-001', 'Route intent to specific agent (unicast)', async () => {
    const envelope = {
      id: 'intent-' + Date.now(),
      traceId: 'trace-' + Date.now(),
      fromDID: generateTestDID(),
      toDID: testDID1, // Registered agent
      msgType: 'INTENT',
      ttl: 300,
      timestamp: Date.now(),
      sig: 'dummy-signature-for-testing',
      payload: {
        intentId: 'intent-001',
        action: 'schedule_meeting',
        params: {
          title: 'Sprint Planning',
          date: '2025-10-07T14:00:00Z'
        }
      }
    };

    const response = await fetch(`${API_BASE}/api/intents/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    });

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200, got ${response.status}. Response: ${text}`);
    }

    const data: any = await response.json();
    if (data.status !== 'routed') {
      throw new Error('Expected status "routed"');
    }
  });

  await runTest('ROUTE-002', 'Route intent with discovery (broadcast)', async () => {
    const envelope = {
      id: 'intent-broadcast-' + Date.now(),
      traceId: 'trace-broadcast-' + Date.now(),
      fromDID: generateTestDID(),
      // No toDID - use discovery
      msgType: 'INTENT',
      ttl: 300,
      timestamp: Date.now(),
      sig: 'dummy-signature',
      payload: {
        intentId: 'intent-002',
        action: 'schedule_meeting',
        params: {}
      },
      query: {
        description: 'schedule meeting',
        tags: ['calendar']
      }
    };

    const response = await fetch(`${API_BASE}/api/intents/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    });

    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`Expected 200, got ${response.status}. Response: ${text}`);
    }

    const data: any = await response.json();
    if (data.status !== 'routed') {
      throw new Error('Expected status "routed"');
    }
  });

  await runTest('ROUTE-003', 'Test malformed envelope', async () => {
    const envelope = {
      // Missing required fields
      id: 'intent-' + Date.now(),
      // Missing fromDID, msgType, etc.
    };

    const response = await fetch(`${API_BASE}/api/intents/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    });

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }
  });

  console.log();
  console.log('='.repeat(80));
  console.log('PHASE 2 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log();

  // Write results to log file
  const logContent = `
PHASE 2: CORE API TESTING RESULTS
Date: ${new Date().toISOString()}

Summary:
- Total Tests: ${totalTests}
- Passed: ${passedTests}
- Failed: ${failedTests}
- Pass Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%

Detailed Results:
${results.map(r => `${r.status === 'PASS' ? '✅' : '❌'} ${r.id}: ${r.name} (${r.duration}ms)${r.error ? '\n   Error: ' + r.error : ''}`).join('\n')}
`;

  const fs = require('fs');
  const path = require('path');
  const logPath = path.join('/Users/agentsy/developer/ainp/logs', 'phase2-api.log');
  fs.writeFileSync(logPath, logContent);
  console.log(`Results written to: ${logPath}`);

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
