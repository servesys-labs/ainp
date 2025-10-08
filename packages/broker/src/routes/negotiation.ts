/**
 * AINP Negotiation Routes
 * REST API endpoints for multi-round negotiation protocol
 */

import { Router } from 'express';
import { NegotiationService } from '../services/negotiation';

export function createNegotiationRoutes(negotiationService: NegotiationService): Router {
  const router = Router();

  /**
   * POST /api/negotiations - Initiate new negotiation
   *
   * Body:
   * - intent_id: string (required)
   * - initiator_did: string (required)
   * - responder_did: string (required)
   * - initial_proposal: object (required)
   * - max_rounds?: number (optional, default 10)
   * - ttl_minutes?: number (optional, default 60)
   *
   * Returns: 201 Created + NegotiationSession
   */
  router.post('/', async (req, res) => {
    try {
      const { intent_id, initiator_did, responder_did, initial_proposal, max_rounds, ttl_minutes } = req.body;

      // Validation
      if (!intent_id || !initiator_did || !responder_did || !initial_proposal) {
        return res.status(400).json({ error: 'Missing required fields: intent_id, initiator_did, responder_did, initial_proposal' });
      }

      const session = await negotiationService.initiate({
        intent_id,
        initiator_did,
        responder_did,
        initial_proposal,
        max_rounds,
        ttl_minutes
      });

      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/negotiations/:id/propose - Submit counter-proposal
   *
   * Body:
   * - proposer_did: string (required)
   * - proposal: object (required)
   *
   * Returns: 200 OK + updated NegotiationSession
   * Errors: 404 Not Found, 400 Bad Request, 410 Gone, 409 Conflict
   */
  router.post('/:id/propose', async (req, res) => {
    try {
      const { id } = req.params;
      const { proposer_did, proposal } = req.body;

      if (!proposer_did || !proposal) {
        return res.status(400).json({ error: 'Missing required fields: proposer_did, proposal' });
      }

      const session = await negotiationService.propose(id, proposer_did, proposal);

      res.json(session);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Map service errors to HTTP status codes
      const statusCode = errorMessage.includes('not found') ? 404 :
                         errorMessage.includes('Invalid state transition') ? 400 :
                         errorMessage.includes('expired') ? 410 :
                         errorMessage.includes('max rounds') ? 409 : 500;

      res.status(statusCode).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/negotiations/:id/accept - Accept current proposal
   *
   * Body:
   * - acceptor_did: string (required)
   *
   * Returns: 200 OK + updated NegotiationSession (state: accepted)
   * Errors: 404 Not Found, 400 Bad Request, 410 Gone
   */
  router.post('/:id/accept', async (req, res) => {
    try {
      const { id } = req.params;
      const { acceptor_did } = req.body;

      if (!acceptor_did) {
        return res.status(400).json({ error: 'Missing acceptor_did' });
      }

      const session = await negotiationService.accept(id, acceptor_did);

      res.json(session);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const statusCode = errorMessage.includes('not found') ? 404 :
                         errorMessage.includes('Invalid state transition') ? 400 :
                         errorMessage.includes('expired') ? 410 : 500;

      res.status(statusCode).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/negotiations/:id/reject - Reject current proposal
   *
   * Body:
   * - rejector_did: string (required)
   * - reason?: string (optional)
   *
   * Returns: 200 OK + updated NegotiationSession (state: rejected)
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.post('/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      const { rejector_did, reason } = req.body;

      if (!rejector_did) {
        return res.status(400).json({ error: 'Missing rejector_did' });
      }

      const session = await negotiationService.reject(id, rejector_did, reason);

      res.json(session);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = errorMessage.includes('not found') ? 404 : 500;

      res.status(statusCode).json({ error: errorMessage });
    }
  });

  /**
   * GET /api/negotiations/:id - Get negotiation session by ID
   *
   * Returns: 200 OK + NegotiationSession
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const session = await negotiationService.getSession(id);

      if (!session) {
        return res.status(404).json({ error: 'Negotiation not found' });
      }

      res.json(session);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * GET /api/negotiations - Get negotiations by agent
   *
   * Query Parameters:
   * - agent_did: string (required) - DID of agent (initiator or responder)
   * - state?: 'active' | 'accepted' | 'rejected' | 'expired' (optional)
   *
   * Returns: 200 OK + NegotiationSession[]
   * Errors: 400 Bad Request, 500 Internal Server Error
   */
  router.get('/', async (req, res) => {
    try {
      const { agent_did, state } = req.query;

      if (!agent_did) {
        return res.status(400).json({ error: 'Missing agent_did query parameter' });
      }

      const sessions = await negotiationService.getSessionsByAgent(
        agent_did as string,
        state as any
      );

      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
