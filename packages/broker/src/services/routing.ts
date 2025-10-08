/**
 * Intent Routing Service
 * Route intents from discovery to delivery
 */

import { AINPEnvelope, DiscoveryQuery } from '@ainp/core';
import type { MessageIntent } from '@ainp/core/src/types/intent';
import { DiscoveryService } from './discovery';
import { NATSClient } from '../lib/nats-client';
import { SignatureService } from './signature';
import { TrustService } from './trust';
import { MailboxService } from './mailbox';
import { ContactService } from './contacts';

export class RoutingService {
  constructor(
    private discoveryService: DiscoveryService,
    private natsClient: NATSClient,
    private signatureService: SignatureService,
    private trustService: TrustService,
    private mailboxService?: MailboxService,
    private contactService?: ContactService
  ) {}

  /**
   * Route intent to matching agents
   */
  async routeIntent(envelope: AINPEnvelope, query?: DiscoveryQuery): Promise<number> {
    // Verify signature
    if (!(await this.signatureService.verifyEnvelope(envelope))) {
      throw new Error('Invalid envelope signature');
    }

    // Verify TTL
    if (!this.signatureService.verifyTTL(envelope)) {
      throw new Error('Envelope TTL expired');
    }

    // Direct routing if to_did is specified
    if (envelope.to_did) {
      await this.natsClient.publishIntent(envelope);

      // Store message in mailbox if it's a MessageIntent
      if (this.mailboxService && this.isMessageIntent(envelope.payload)) {
        try {
          await this.mailboxService.store(envelope, envelope.payload as MessageIntent);
        } catch (error) {
          console.error('[RoutingService] Failed to store message:', error);
          // Don't fail routing if storage fails
        }
      }

      // Record interaction in contacts
      if (this.contactService) {
        try {
          await this.contactService.recordInteraction(envelope.to_did, envelope.from_did);
        } catch (error) {
          console.error('[RoutingService] Failed to record interaction:', error);
        }
      }

      return 1;
    }

    // Discovery-based routing
    if (!query) {
      throw new Error('Query required for discovery-based routing');
    }

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

      // Store message in mailbox if it's a MessageIntent
      if (this.mailboxService && this.isMessageIntent(envelope.payload)) {
        try {
          await this.mailboxService.store(routedEnvelope, envelope.payload as MessageIntent);
        } catch (error) {
          console.error('[RoutingService] Failed to store message:', error);
        }
      }

      // Record interaction in contacts
      if (this.contactService) {
        try {
          await this.contactService.recordInteraction(agent.did, envelope.from_did);
        } catch (error) {
          console.error('[RoutingService] Failed to record interaction:', error);
        }
      }
    }

    return topAgents.length;
  }

  /**
   * Check if intent is a MessageIntent
   */
  private isMessageIntent(intent: any): boolean {
    return intent && (
      intent['@type'] === 'MESSAGE' ||
      intent['@type'] === 'EMAIL_MESSAGE' ||
      intent['@type'] === 'CHAT_MESSAGE' ||
      intent['@type'] === 'NOTIFICATION'
    );
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
