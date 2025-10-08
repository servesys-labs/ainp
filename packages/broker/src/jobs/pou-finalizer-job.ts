/**
 * PoU Finalizer Job
 *
 * Periodically scans pending task receipts and finalizes those that meet quorum
 * based on attestations. Prototype: counts ACCEPTED and AUDIT_PASS; if count >= k,
 * mark as finalized.
 */

import cron from 'node-cron';
import { DatabaseClient } from '../lib/db-client';
import { Logger } from '@ainp/sdk';

const logger = new Logger({ serviceName: 'pou-finalizer' });

export function startPouFinalizerJob(db: DatabaseClient) {
  const enabled = process.env.POU_FINALIZER_ENABLED !== 'false';
  if (!enabled) {
    logger.info('[PoU Finalizer] Disabled via flag POU_FINALIZER_ENABLED');
    return;
  }

  const cronExpr = process.env.POU_FINALIZER_CRON || '*/1 * * * *'; // every minute

  cron.schedule(cronExpr, async () => {
    try {
      const k = parseInt(process.env.POU_K || '3');
      // Find pending receipts
      const pending = await db.query(
        `SELECT id, k FROM task_receipts WHERE status='pending' ORDER BY created_at ASC LIMIT 100`
      );

      for (const row of pending.rows) {
        const taskId = row.id as string;
        const quorum = Number(row.k || k);
        // Count attestations (ACCEPTED or AUDIT_PASS)
        const counts = await db.query(
          `SELECT COUNT(*) AS c FROM task_attestations WHERE task_id=$1 AND type IN ('ACCEPTED','AUDIT_PASS')`,
          [taskId]
        );
        const c = Number(counts.rows[0].c || 0);
        if (c >= quorum) {
          await db.query(
            `UPDATE task_receipts SET status='finalized', finalized_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [taskId]
          );
          logger.info('[PoU Finalizer] Finalized task receipt', { task_id: taskId, attestations: c });
        }
      }
    } catch (error) {
      logger.error('[PoU Finalizer] Job error', { error: error instanceof Error ? error.message : String(error) });
    }
  });

  logger.info(`[PoU Finalizer] Cron job scheduled (${cronExpr})`);
}

