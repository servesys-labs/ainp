/**
 * Mail API Routes
 * Inbox, threads, read/unread, and label management
 */

import { Router, Request, Response } from 'express';
import { MailboxService } from '../services/mailbox.js';
import { FeatureFlag, getFeatureFlag } from '../lib/feature-flags.js';

/**
 * Create mail routes
 * @param mailboxService Mailbox service instance
 * @returns Express router
 */
export function createMailRoutes(mailboxService: MailboxService): Router {
  const router = Router();

  /**
   * GET /api/mail/inbox
   * List inbox messages with pagination and filters
   */
  router.get('/inbox', async (req: Request, res: Response) => {
    try {
      // Check feature flag
      if (!getFeatureFlag(FeatureFlag.MESSAGING_ENABLED)) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Messaging is not enabled'
        });
      }

      // Extract agent DID from auth middleware (x-ainp-did header)
      const ownerDid = req.headers['x-ainp-did'] as string;
      if (!ownerDid) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Agent DID not found in request headers'
        });
      }

      // Parse query parameters
      const limit = parseInt(req.query.limit as string) || 50;
      const cursor = req.query.cursor as string | undefined;
      const label = req.query.label as string | undefined;
      const unread_only = req.query.unread === 'true';

      // Validate limit
      if (limit < 1 || limit > 200) {
        return res.status(400).json({
          error: 'INVALID_LIMIT',
          message: 'Limit must be between 1 and 200'
        });
      }

      // Get inbox messages
      const messages = await mailboxService.listInbox(ownerDid, {
        limit,
        cursor,
        label,
        unread_only
      });

      // Return paginated response
      res.json({
        messages,
        pagination: {
          limit,
          cursor: messages.length > 0 ? messages[messages.length - 1].created_at : null,
          has_more: messages.length === limit
        }
      });
    } catch (error) {
      console.error('[MailAPI] Inbox error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/mail/threads/:conversation_id
   * Get a specific thread with all messages
   */
  router.get('/threads/:conversation_id', async (req: Request, res: Response) => {
    try {
      // Check feature flag
      if (!getFeatureFlag(FeatureFlag.MESSAGING_ENABLED)) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Messaging is not enabled'
        });
      }

      // Extract agent DID from auth middleware
      const ownerDid = req.headers['x-ainp-did'] as string;
      if (!ownerDid) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Agent DID not found in request headers'
        });
      }

      const conversationId = req.params.conversation_id;

      // Get thread
      const thread = await mailboxService.getThread(ownerDid, conversationId);

      if (!thread) {
        return res.status(404).json({
          error: 'THREAD_NOT_FOUND',
          message: 'Thread not found'
        });
      }

      res.json(thread);
    } catch (error) {
      // Handle ACL errors
      if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
        return res.status(403).json({
          error: 'ACCESS_DENIED',
          message: error.message
        });
      }

      console.error('[MailAPI] Thread error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/mail/read
   * Mark a message as read or unread
   * Body: { message_id: string, read?: boolean }
   */
  router.post('/read', async (req: Request, res: Response) => {
    try {
      // Check feature flag
      if (!getFeatureFlag(FeatureFlag.MESSAGING_ENABLED)) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Messaging is not enabled'
        });
      }

      // Extract agent DID from auth middleware
      const ownerDid = req.headers['x-ainp-did'] as string;
      if (!ownerDid) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Agent DID not found in request headers'
        });
      }

      const { message_id, read = true } = req.body;

      // Validate request
      if (!message_id) {
        return res.status(400).json({
          error: 'MISSING_MESSAGE_ID',
          message: 'message_id is required'
        });
      }

      // Mark read/unread
      await mailboxService.markRead(ownerDid, message_id, read);

      res.json({
        success: true,
        message_id,
        read
      });
    } catch (error) {
      // Handle ACL errors
      if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
        return res.status(403).json({
          error: 'ACCESS_DENIED',
          message: error.message
        });
      }

      console.error('[MailAPI] Mark read error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/mail/label
   * Add or remove labels from a message
   * Body: { message_id: string, add?: string[], remove?: string[] }
   */
  router.post('/label', async (req: Request, res: Response) => {
    try {
      // Check feature flag
      if (!getFeatureFlag(FeatureFlag.MESSAGING_ENABLED)) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Messaging is not enabled'
        });
      }

      // Extract agent DID from auth middleware
      const ownerDid = req.headers['x-ainp-did'] as string;
      if (!ownerDid) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Agent DID not found in request headers'
        });
      }

      const { message_id, add, remove } = req.body;

      // Validate request
      if (!message_id) {
        return res.status(400).json({
          error: 'MISSING_MESSAGE_ID',
          message: 'message_id is required'
        });
      }

      if (!add && !remove) {
        return res.status(400).json({
          error: 'NO_LABELS',
          message: 'At least one of add or remove must be provided'
        });
      }

      // Update labels
      await mailboxService.labelMessage(ownerDid, message_id, { add, remove });

      res.json({
        success: true,
        message_id,
        labels_added: add || [],
        labels_removed: remove || []
      });
    } catch (error) {
      // Handle ACL errors
      if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
        return res.status(403).json({
          error: 'ACCESS_DENIED',
          message: error.message
        });
      }

      console.error('[MailAPI] Label error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}
