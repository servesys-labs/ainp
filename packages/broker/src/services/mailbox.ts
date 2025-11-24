/**
 * MailboxService - Unified message storage and retrieval
 * Handles inbox, threads, read/unread state, and labels
 */

import { DatabaseClient } from '../lib/db-client.js';
import { AINPEnvelope } from '@ainp/core';
import type { MessageIntent, MessageSemantics } from '@ainp/core/src/types/intent';
import { createHash } from 'crypto';

export interface StoredMessage {
  id: string;
  envelope_id: string;
  conversation_id?: string;
  from_did: string;
  to_dids: string[];
  subject?: string;
  body_text: string;
  body_mime: string;
  body_hash: string;
  headers: Record<string, unknown>;
  attachments: unknown[];
  labels: string[];
  created_at: Date;
  received_at: Date;
  read_at?: Date;
  intent_type: string;
}

export interface Thread {
  id: string;
  subject?: string;
  participants: unknown[];
  message_count: number;
  unread_count: number;
  last_message_at?: Date;
  first_message_at?: Date;
  labels: string[];
  messages?: StoredMessage[];
}

export interface InboxQuery {
  limit?: number;
  cursor?: string;  // created_at timestamp for pagination
  label?: string;
  unread_only?: boolean;
}

export class MailboxService {
  private wsHandler?: any; // Optional WebSocketHandler for notifications

  constructor(private db: DatabaseClient, wsHandler?: any) {
    this.wsHandler = wsHandler;
  }

  /**
   * Attach or replace WebSocket handler after construction
   */
  setWebSocketHandler(wsHandler: any) {
    this.wsHandler = wsHandler;
  }

  /**
   * Store a message in the mailbox
   * @param envelope AINP envelope containing the message
   * @param intent MessageIntent payload
   * @returns Message ID
   */
  async store(envelope: AINPEnvelope, intent: MessageIntent): Promise<string> {
    const semantics = intent.semantics as MessageSemantics;

    // Extract recipients from envelope
    const toDids = envelope.to_did ? [envelope.to_did] : [];

    // Calculate body hash for deduplication
    const bodyHash = this.calculateBodyHash(semantics.content);

    // Extract conversation_id (use existing or generate from participants)
    const conversationId = semantics.conversation_id || this.generateConversationId(envelope.from_did, toDids);

    // Prepare attachments and headers
    const attachments = semantics.attachments || [];
    const headers = (semantics as any).headers || {};

    const result = await this.db.query(
      `INSERT INTO messages (
        envelope_id, conversation_id, from_did, to_dids,
        subject, body_text, body_mime, body_hash,
        headers, attachments, labels,
        created_at, received_at,
        intent_type, intent_context
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14
      )
      RETURNING id`,
      [
        envelope.id,
        conversationId,
        envelope.from_did,
        toDids,
        semantics.subject || null,
        semantics.content,
        semantics.content_type || 'text/plain',
        bodyHash,
        JSON.stringify(headers),
        JSON.stringify(attachments),
        semantics.labels || [],
        new Date(envelope.timestamp),
        intent['@type'],
        intent['@context']
      ]
    );

    const messageId = result.rows[0].id;

    // Send WebSocket notification to recipients
    if (this.wsHandler) {
      for (const recipientDid of toDids) {
        try {
          await this.wsHandler.notifyNewMessage(recipientDid, {
            type: 'new_message',
            message_id: messageId,
            conversation_id: conversationId,
            from_did: envelope.from_did,
            subject: semantics.subject,
            preview: semantics.content.substring(0, 100),
            timestamp: envelope.timestamp,
          });
        } catch (error) {
          // Don't fail message storage if notification fails
          console.error('[MailboxService] Failed to send notification:', error);
        }
      }
    }

    return messageId;
  }

  /**
   * List inbox messages for a specific agent
   * @param ownerDid Agent DID
   * @param query Pagination and filter options
   * @returns List of messages
   */
  async listInbox(ownerDid: string, query: InboxQuery = {}): Promise<StoredMessage[]> {
    const { limit = 50, cursor, label, unread_only = false } = query;

    let sql = `
      SELECT id, envelope_id, conversation_id, from_did, to_dids,
             subject, body_text, body_mime, body_hash,
             headers, attachments, labels,
             created_at, received_at, read_at, intent_type
      FROM messages
      WHERE $1 = ANY(to_dids)
    `;

    const params: any[] = [ownerDid];
    let paramIndex = 2;

    // Filter by unread
    if (unread_only) {
      sql += ` AND read_at IS NULL`;
    }

    // Filter by label
    if (label) {
      sql += ` AND $${paramIndex} = ANY(labels)`;
      params.push(label);
      paramIndex++;
    }

    // Pagination cursor (created_at)
    if (cursor) {
      sql += ` AND created_at < $${paramIndex}`;
      params.push(new Date(cursor));
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Get a specific thread with all messages
   * @param ownerDid Agent DID (for ACL check)
   * @param conversationId Thread ID
   * @returns Thread with messages
   */
  async getThread(ownerDid: string, conversationId: string): Promise<Thread | null> {
    // Get thread metadata
    const threadResult = await this.db.query(
      `SELECT id, subject, participants, message_count, unread_count,
              last_message_at, first_message_at, labels
       FROM threads
       WHERE id = $1`,
      [conversationId]
    );

    if (threadResult.rows.length === 0) {
      return null;
    }

    // ACL check: verify ownerDid is a participant
    const thread = threadResult.rows[0];
    const participants = thread.participants as any[];
    const isParticipant = participants.some(p => p.did === ownerDid);

    if (!isParticipant) {
      throw new Error('ACCESS_DENIED: Not a participant in this thread');
    }

    // Get all messages in thread
    const messagesResult = await this.db.query(
      `SELECT id, envelope_id, conversation_id, from_did, to_dids,
              subject, body_text, body_mime, body_hash,
              headers, attachments, labels,
              created_at, received_at, read_at, intent_type
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return {
      ...thread,
      messages: messagesResult.rows
    };
  }

  /**
   * Mark a message as read or unread
   * @param ownerDid Agent DID (for ACL check)
   * @param messageId Message ID
   * @param read True to mark as read, false to mark as unread
   */
  async markRead(ownerDid: string, messageId: string, read: boolean = true): Promise<void> {
    // ACL check: verify ownerDid is a recipient
    const checkResult = await this.db.query(
      `SELECT id FROM messages WHERE id = $1 AND $2 = ANY(to_dids)`,
      [messageId, ownerDid]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('ACCESS_DENIED: Message not found or not a recipient');
    }

    // Update read_at timestamp
    await this.db.query(
      `UPDATE messages SET read_at = $1 WHERE id = $2`,
      [read ? new Date() : null, messageId]
    );
  }

  /**
   * Add or remove labels from a message
   * @param ownerDid Agent DID (for ACL check)
   * @param messageId Message ID
   * @param options Labels to add or remove
   */
  async labelMessage(
    ownerDid: string,
    messageId: string,
    options: { add?: string[]; remove?: string[] }
  ): Promise<void> {
    // ACL check: verify ownerDid is a recipient
    const checkResult = await this.db.query(
      `SELECT id, labels FROM messages WHERE id = $1 AND $2 = ANY(to_dids)`,
      [messageId, ownerDid]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('ACCESS_DENIED: Message not found or not a recipient');
    }

    const currentLabels = checkResult.rows[0].labels as string[];
    let newLabels = [...currentLabels];

    // Add labels
    if (options.add) {
      newLabels = [...new Set([...newLabels, ...options.add])];
    }

    // Remove labels
    if (options.remove) {
      newLabels = newLabels.filter(l => !options.remove!.includes(l));
    }

    // Update labels
    await this.db.query(
      `UPDATE messages SET labels = $1 WHERE id = $2`,
      [newLabels, messageId]
    );
  }

  /**
   * Calculate SHA256 hash of message body for deduplication
   */
  private calculateBodyHash(content: string): string {
    return 'sha256:' + createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate a stable conversation_id from participants
   * Uses sorted DIDs to ensure same ID regardless of sender/recipient order
   */
  private generateConversationId(fromDid: string, toDids: string[]): string {
    const participants = [fromDid, ...toDids].sort();
    const hash = createHash('sha256').update(participants.join('|')).digest('hex');
    return `conv_${hash.substring(0, 32)}`;
  }
}
