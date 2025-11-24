/**
 * Mailbox → Memory distiller job
 */

import cron from 'node-cron';
import { Logger } from '@ainp/sdk';
import { MemoryDistillerService } from '../services/memory-distiller.js';

const logger = new Logger({ serviceName: 'mailbox-distiller' });

export function startMailboxDistillerJob(service: MemoryDistillerService) {
  const enabled = process.env.MEMORY_DISTILLER_ENABLED === 'true';
  if (!enabled) {
    logger.info('[MemoryDistiller] Disabled (set MEMORY_DISTILLER_ENABLED=true to enable)');
    return;
  }

  const cronExpr = process.env.MEMORY_DISTILLER_CRON || '*/5 * * * *'; // every 5 minutes
  const windowMin = parseInt(process.env.MEMORY_DISTILLER_WINDOW_MIN || '10');
  const batchLimit = parseInt(process.env.MEMORY_DISTILLER_BATCH_LIMIT || '200');

  cron.schedule(cronExpr, async () => {
    try {
      const n = await service.processWindow(windowMin, batchLimit);
      if (n > 0) logger.info(`[MemoryDistiller] Stored ${n} memories`);
    } catch (error) {
      logger.error('[MemoryDistiller] Job error', { error: error instanceof Error ? error.message : String(error) });
    }
  });

  logger.info(`[MemoryDistiller] Scheduled (${cronExpr}) window=${windowMin}m batch=${batchLimit}`);
}

