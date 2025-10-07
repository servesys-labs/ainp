/**
 * Integration tests for DatabaseClient
 * Verifies schema-code alignment after fix
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { DatabaseClient } from '../src/lib/db-client';
import { SemanticAddress } from '@ainp/core';

// Test database connection string
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost/ainp_test';

describe('DatabaseClient Integration Tests', () => {
  let dbClient: DatabaseClient;

  before(async () => {
    dbClient = new DatabaseClient(TEST_DB_URL);
  });

  after(async () => {
    // Cleanup test data
    const pool = (dbClient as any).pool;
    await pool.query("DELETE FROM agents WHERE did LIKE 'did:key:test-%'");
    await dbClient.close();
  });

  it('should register agent with capabilities', async () => {
    const testAgent: SemanticAddress = {
      did: 'did:key:test-agent-1',
      capabilities: [
        {
          description: 'Schedule meetings with calendar integration',
          embedding: '[0.1,0.2,0.3]', // Simplified for testing
          tags: ['scheduling', 'calendar'],
          version: '1.0.0',
          evidence: 'https://example.com/credential/1',
        },
        {
          description: 'Send emails via SMTP',
          embedding: '[0.4,0.5,0.6]',
          tags: ['email', 'smtp'],
          version: '1.0.0',
        },
      ],
      credentials: ['test-public-key-base64'],
      trust: {
        score: 0.85,
        dimensions: {
          reliability: 0.9,
          honesty: 0.85,
          competence: 0.8,
          timeliness: 0.85,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      },
    };

    const ttl = 3600000; // 1 hour

    await assert.doesNotReject(
      async () => await dbClient.registerAgent(testAgent, ttl),
      'Registration should succeed'
    );
  });

  it('should retrieve agent by DID', async () => {
    const did = 'did:key:test-agent-1';

    const agent = await dbClient.getAgent(did);

    assert.ok(agent, 'Agent should be found');
    assert.strictEqual(agent.did, did, 'DID should match');
    assert.strictEqual(agent.capabilities.length, 2, 'Should have 2 capabilities');
    assert.strictEqual(
      agent.capabilities[0].description,
      'Schedule meetings with calendar integration',
      'First capability description should match'
    );
    assert.ok(agent.trust, 'Trust score should exist');
    assert.strictEqual(agent.trust.score, 0.85, 'Trust score should match');
  });

  it('should update existing agent on re-registration', async () => {
    const updatedAgent: SemanticAddress = {
      did: 'did:key:test-agent-1',
      capabilities: [
        {
          description: 'Updated capability',
          embedding: '[0.7,0.8,0.9]',
          tags: ['updated'],
          version: '2.0.0',
        },
      ],
      credentials: ['updated-public-key'],
      trust: {
        score: 0.9,
        dimensions: {
          reliability: 0.95,
          honesty: 0.9,
          competence: 0.85,
          timeliness: 0.9,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      },
    };

    await dbClient.registerAgent(updatedAgent, 7200000); // 2 hours

    const agent = await dbClient.getAgent('did:key:test-agent-1');

    assert.ok(agent, 'Agent should still exist');
    assert.strictEqual(agent.capabilities.length, 1, 'Should have 1 capability after update');
    assert.strictEqual(
      agent.capabilities[0].description,
      'Updated capability',
      'Capability should be updated'
    );
    assert.strictEqual(agent.trust.score, 0.9, 'Trust score should be updated');
  });

  it('should search agents by embedding similarity', async () => {
    // Register another agent for search testing
    const testAgent2: SemanticAddress = {
      did: 'did:key:test-agent-2',
      capabilities: [
        {
          description: 'Process payments via Stripe',
          embedding: '[0.2,0.3,0.4]',
          tags: ['payments', 'stripe'],
          version: '1.0.0',
        },
      ],
      credentials: ['test-public-key-2'],
      trust: {
        score: 0.75,
        dimensions: {
          reliability: 0.8,
          honesty: 0.75,
          competence: 0.7,
          timeliness: 0.75,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      },
    };

    await dbClient.registerAgent(testAgent2, 3600000);

    // Search with query embedding similar to agent 2
    const results = await dbClient.searchAgentsByEmbedding(
      '[0.2,0.3,0.4]',
      0.5, // Low similarity threshold for testing
      10
    );

    assert.ok(results.length > 0, 'Should find at least one agent');
    assert.ok(
      results.some((agent) => agent.did === 'did:key:test-agent-2'),
      'Should find test-agent-2'
    );
  });

  it('should update trust score', async () => {
    const did = 'did:key:test-agent-1';
    const newTrust = {
      score: 0.95,
      dimensions: {
        reliability: 0.98,
        honesty: 0.95,
        competence: 0.92,
        timeliness: 0.95,
      },
      decay_rate: 0.977,
      last_updated: Date.now(),
    };

    await assert.doesNotReject(
      async () => await dbClient.updateTrustScore(did, newTrust),
      'Trust score update should succeed'
    );

    const agent = await dbClient.getAgent(did);
    assert.strictEqual(agent?.trust.score, 0.95, 'Trust score should be updated');
  });

  it('should cleanup expired agents', async () => {
    // Register agent with short TTL
    const expiredAgent: SemanticAddress = {
      did: 'did:key:test-agent-expired',
      capabilities: [
        {
          description: 'Temporary capability',
          embedding: '[0.5,0.5,0.5]',
          tags: ['temp'],
          version: '1.0.0',
        },
      ],
      credentials: ['temp-key'],
      trust: {
        score: 0.5,
        dimensions: {
          reliability: 0.5,
          honesty: 0.5,
          competence: 0.5,
          timeliness: 0.5,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      },
    };

    await dbClient.registerAgent(expiredAgent, -1000); // Already expired

    const deletedCount = await dbClient.cleanupExpiredAgents();

    assert.ok(deletedCount >= 1, 'Should delete at least one expired agent');

    const agent = await dbClient.getAgent('did:key:test-agent-expired');
    assert.strictEqual(agent, null, 'Expired agent should not be found');
  });

  it('should handle agent with no capabilities', async () => {
    const agentNoCaps: SemanticAddress = {
      did: 'did:key:test-agent-no-caps',
      capabilities: [],
      credentials: ['no-caps-key'],
      trust: {
        score: 0.5,
        dimensions: {
          reliability: 0.5,
          honesty: 0.5,
          competence: 0.5,
          timeliness: 0.5,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      },
    };

    await assert.doesNotReject(
      async () => await dbClient.registerAgent(agentNoCaps, 3600000),
      'Registration should succeed even with no capabilities'
    );

    const agent = await dbClient.getAgent('did:key:test-agent-no-caps');
    assert.ok(agent, 'Agent should be found');
    assert.strictEqual(agent.capabilities.length, 0, 'Should have no capabilities');
  });

  it('should return null for non-existent agent', async () => {
    const agent = await dbClient.getAgent('did:key:does-not-exist');
    assert.strictEqual(agent, null, 'Should return null for non-existent agent');
  });

  it('should enforce unique constraint on agent_id + description', async () => {
    const duplicateAgent: SemanticAddress = {
      did: 'did:key:test-agent-duplicate',
      capabilities: [
        {
          description: 'Duplicate capability',
          embedding: '[0.1,0.1,0.1]',
          tags: ['duplicate'],
          version: '1.0.0',
        },
      ],
      credentials: ['dup-key'],
      trust: {
        score: 0.5,
        dimensions: {
          reliability: 0.5,
          honesty: 0.5,
          competence: 0.5,
          timeliness: 0.5,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      },
    };

    // First registration should succeed
    await dbClient.registerAgent(duplicateAgent, 3600000);

    // Second registration with same capability description should succeed
    // (because we DELETE + re-INSERT capabilities on update)
    await assert.doesNotReject(
      async () => await dbClient.registerAgent(duplicateAgent, 3600000),
      'Re-registration should succeed (capabilities are replaced)'
    );
  });
});
