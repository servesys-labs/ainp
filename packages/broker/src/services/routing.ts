/**
 * Intent Routing Service
 * Route intents from discovery to delivery
 */

import { AINPEnvelope, DiscoveryQuery } from '@ainp/core';
import { DiscoveryService } from './discovery';
import { NATSClient } from '../lib/nats-client';
import { SignatureService } from './signature';
import { TrustService } from './trust';

export class RoutingService {
  constructor(
    private discoveryService: DiscoveryService,
    private natsClient: NATSClient,
    private signatureService: SignatureService,
    private trustService: TrustService
  ) {}

  /**
   * Route intent to matching agents
   */
  async routeIntent(envelope: AINPEnvelope, query: DiscoveryQuery): Promise<number> {
    // Verify signature
    if (!(await this.signatureService.verifyEnvelope(envelope))) {
      throw new Error('Invalid envelope signature');
    }

    // Verify TTL
    if (!this.signatureService.verifyTTL(envelope)) {
      throw new Error('Envelope TTL expired');
    }

    // Discover matching agents
    const agents = await this.discoveryService.discover(query);

    if (agents.length === 0) {
      throw new Error('No matching agents found');
    }

    // Route to top agents (max 3)
    const topAgents = agents.slice(0, 3);

    for (const agent of topAgents) {
      const routedEnvelope: AINPEnvelope = {
        ...envelope,
        to_did: agent.did,
      };

      await this.natsClient.publishIntent(routedEnvelope);
    }

    return topAgents.length;
  }

  /**
   * Route result back to original sender
   */
  async routeResult(envelope: AINPEnvelope): Promise<void> {
    // Verify signature
    if (!(await this.signatureService.verifyEnvelope(envelope))) {
      throw new Error('Invalid envelope signature');
    }

    // Update trust score for sender
    await this.trustService.updateTrust(envelope.from_did, {
      success: true,
      latency_ms: Date.now() - envelope.timestamp,
      expected_latency_ms: 5000,
    });

    // Route to recipient
    await this.natsClient.publishResult(envelope);
  }

  /**
   * Route negotiation message
   */
  async routeNegotiation(envelope: AINPEnvelope): Promise<void> {
    // Verify signature
    if (!(await this.signatureService.verifyEnvelope(envelope))) {
      throw new Error('Invalid envelope signature');
    }

    // Verify TTL
    if (!this.signatureService.verifyTTL(envelope)) {
      throw new Error('Envelope TTL expired');
    }

    // Route to recipient
    await this.natsClient.publishNegotiation(envelope);
  }
}
