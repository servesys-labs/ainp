/**
 * Smoke tests for unified messaging (mailbox + contacts)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { DatabaseClient } from '../../lib/db-client';
import { MailboxService } from '../../services/mailbox';
import { SignatureService } from '../../services/signature';
import { createMailRoutes } from '../mail';
import { authMiddleware } from '../../middleware/auth';
import type { MessageIntent, MessageSemantics } from '@ainp/core/src/types/intent';
import { AINPEnvelope } from '@ainp/core';

const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost/ainp_test';

describe.skipIf(!process.env.DATABASE_URL)('Mailbox API (Smoke Tests)', () => {
  let app: express.Application;
  let db: DatabaseClient;
  let mailboxService: MailboxService;
  let signatureService: SignatureService;

  const TEST_DID_SENDER = 'did:key:z6MktestSender123456789';
  const TEST_DID_RECIPIENT = 'did:key:z6MktestRecipient987654321';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping mail tests: DATABASE_URL not set');
      return;
    }

    // Initialize database
    db = new DatabaseClient(TEST_DB_URL);
    await db.connect();

    // Initialize services
    mailboxService = new MailboxService(db);
    signatureService = new SignatureService();

    // Create Express app with routes
    const routes = createMailRoutes(mailboxService);
    app = express();
    app.use(express.json());

    // Mock auth middleware for tests (set x-ainp-did header from query param)
    app.use((req, res, next) => {
      const did = (req.query.did as string) || TEST_DID_RECIPIENT;
      req.headers['x-ainp-did'] = did;
      next();
    });

    app.use('/api/mail', routes);
  });

  afterAll(async () => {
    if (db) {
      await db.disconnect();
    }
  });

  describe('Message Storage and Retrieval', () => {
    it('should store a message and retrieve it from inbox', async () => {
      // Create test message
      const messageIntent: MessageIntent = {
        '@type': 'MESSAGE',
        '@context': 'https://ainp.network/contexts/v1',
        semantics: {
          conversation_id: 'test-conversation-' + Date.now(),
          participants: [TEST_DID_SENDER, TEST_DID_RECIPIENT],
          subject: 'Test Message',
          content: 'Hello from smoke test',
          content_type: 'text/plain',
        } as MessageSemantics,
      };

      const envelope: AINPEnvelope = {
        id: 'test-envelope-' + Date.now(),
        trace_id: 'test-trace-' + Date.now(),
        from_did: TEST_DID_SENDER,
        to_did: TEST_DID_RECIPIENT,
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: 'test-signature',
        payload: messageIntent,
      };

      // Store message
      const messageId = await mailboxService.store(envelope, messageIntent);
      expect(messageId).toBeTruthy();

      // Retrieve from inbox
      const response = await request(app)
        .get('/api/mail/inbox')
        .query({ did: TEST_DID_RECIPIENT });

      expect(response.status).toBe(200);
      expect(response.body.messages).toBeDefined();
      expect(Array.isArray(response.body.messages)).toBe(true);

      // Find our message
      const storedMessage = response.body.messages.find(
        (m: any) => m.subject === 'Test Message'
      );
      expect(storedMessage).toBeDefined();
      expect(storedMessage.from_did).toBe(TEST_DID_SENDER);
      expect(storedMessage.body_text).toBe('Hello from smoke test');
    });

    it('should mark message as read', async () => {
      // Create and store test message
      const messageIntent: MessageIntent = {
        '@type': 'MESSAGE',
        '@context': 'https://ainp.network/contexts/v1',
        semantics: {
          participants: [TEST_DID_SENDER, TEST_DID_RECIPIENT],
          content: 'Test read status',
          content_type: 'text/plain',
        } as MessageSemantics,
      };

      const envelope: AINPEnvelope = {
        id: 'test-read-' + Date.now(),
        trace_id: 'test-trace-read-' + Date.now(),
        from_did: TEST_DID_SENDER,
        to_did: TEST_DID_RECIPIENT,
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: 'test-signature',
        payload: messageIntent,
      };

      const messageId = await mailboxService.store(envelope, messageIntent);

      // Mark as read
      const response = await request(app)
        .post('/api/mail/read')
        .query({ did: TEST_DID_RECIPIENT })
        .send({ message_id: messageId, read: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should add labels to message', async () => {
      // Create and store test message
      const messageIntent: MessageIntent = {
        '@type': 'MESSAGE',
        '@context': 'https://ainp.network/contexts/v1',
        semantics: {
          participants: [TEST_DID_SENDER, TEST_DID_RECIPIENT],
          content: 'Test labels',
          content_type: 'text/plain',
        } as MessageSemantics,
      };

      const envelope: AINPEnvelope = {
        id: 'test-label-' + Date.now(),
        trace_id: 'test-trace-label-' + Date.now(),
        from_did: TEST_DID_SENDER,
        to_did: TEST_DID_RECIPIENT,
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: 'test-signature',
        payload: messageIntent,
      };

      const messageId = await mailboxService.store(envelope, messageIntent);

      // Add labels
      const response = await request(app)
        .post('/api/mail/label')
        .query({ did: TEST_DID_RECIPIENT })
        .send({ message_id: messageId, add: ['important', 'work'] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Thread Retrieval', () => {
    it('should retrieve thread with all messages', async () => {
      const conversationId = 'test-thread-' + Date.now();

      // Create multiple messages in same thread
      for (let i = 0; i < 3; i++) {
        const messageIntent: MessageIntent = {
          '@type': 'MESSAGE',
          '@context': 'https://ainp.network/contexts/v1',
          semantics: {
            conversation_id: conversationId,
            participants: [TEST_DID_SENDER, TEST_DID_RECIPIENT],
            content: `Thread message ${i + 1}`,
            content_type: 'text/plain',
          } as MessageSemantics,
        };

        const envelope: AINPEnvelope = {
          id: `test-thread-msg-${i}-${Date.now()}`,
          trace_id: `test-trace-thread-${i}-${Date.now()}`,
          from_did: TEST_DID_SENDER,
          to_did: TEST_DID_RECIPIENT,
          msg_type: 'INTENT',
          ttl: 3600000,
          timestamp: Date.now() + i * 1000, // Stagger timestamps
          sig: 'test-signature',
          payload: messageIntent,
        };

        await mailboxService.store(envelope, messageIntent);
      }

      // Retrieve thread
      const response = await request(app)
        .get(`/api/mail/threads/${conversationId}`)
        .query({ did: TEST_DID_RECIPIENT });

      expect(response.status).toBe(200);
      expect(response.body.thread).toBeDefined();
      expect(response.body.messages).toBeDefined();
      expect(response.body.messages.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('ACL Enforcement', () => {
    it('should block non-participant from accessing thread', async () => {
      const conversationId = 'test-acl-' + Date.now();
      const otherDID = 'did:key:z6MkOtherUser123';

      // Create message between sender and recipient
      const messageIntent: MessageIntent = {
        '@type': 'MESSAGE',
        '@context': 'https://ainp.network/contexts/v1',
        semantics: {
          conversation_id: conversationId,
          participants: [TEST_DID_SENDER, TEST_DID_RECIPIENT],
          content: 'Private conversation',
          content_type: 'text/plain',
        } as MessageSemantics,
      };

      const envelope: AINPEnvelope = {
        id: 'test-acl-' + Date.now(),
        trace_id: 'test-trace-acl-' + Date.now(),
        from_did: TEST_DID_SENDER,
        to_did: TEST_DID_RECIPIENT,
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: 'test-signature',
        payload: messageIntent,
      };

      await mailboxService.store(envelope, messageIntent);

      // Try to access as non-participant
      const response = await request(app)
        .get(`/api/mail/threads/${conversationId}`)
        .query({ did: otherDID });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
    });
  });

  describe('Pagination', () => {
    it('should paginate inbox with cursor', async () => {
      // Get first page
      const firstPage = await request(app)
        .get('/api/mail/inbox')
        .query({ did: TEST_DID_RECIPIENT, limit: 5 });

      expect(firstPage.status).toBe(200);
      expect(firstPage.body.pagination).toBeDefined();
      expect(firstPage.body.pagination.limit).toBe(5);

      // If we have results, check cursor
      if (firstPage.body.messages.length > 0) {
        expect(firstPage.body.pagination.cursor).toBeTruthy();
      }
    });
  });
});
