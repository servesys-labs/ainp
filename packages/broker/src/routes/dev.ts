/**
 * Development-only routes
 */

import { Router } from 'express';
import { EmbeddingService } from '../services/embeddings';

export function createDevRoutes(embeddingService: EmbeddingService): Router {
  const router = Router();

  // POST /api/dev/embed { text }
  router.post('/embed', async (req, res) => {
    try {
      const text: string | undefined = req.body?.text;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'INVALID_REQUEST', message: 'text is required' });
      }
      const embedding = await embeddingService.embed(text);
      res.json({ embedding });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // POST /api/dev/embed_batch { texts: string[] }
  router.post('/embed_batch', async (req, res) => {
    try {
      const texts: unknown = req.body?.texts;
      if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
        return res.status(400).json({ error: 'INVALID_REQUEST', message: 'texts: string[] required' });
      }
      const embeddings = await embeddingService.embedBatch(texts as string[]);
      res.json({ embeddings });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}

