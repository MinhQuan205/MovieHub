/**
 * bullmq.ts — Shared IORedis connection for BullMQ
 *
 * Design decisions:
 *  - A SINGLE shared IORedis connection is reused across every Queue / Worker /
 *    QueueEvents instance.  This is the BullMQ-recommended pattern: avoid
 *    spawning a new connection per queue to prevent hitting Redis connection
 *    limits.  (BullMQ internally calls `.duplicate()` when it needs its own
 *    blocking connection for Workers.)
 *  - Key prefix: `moviehub:bull:` segregates BullMQ keys from cache keys
 *    (`moviehub:cache:`) and any other tenants sharing the same Redis instance.
 *  - `maxRetriesPerRequest: null` is *required* by BullMQ — it disables the
 *    ioredis built-in retry limit so that BullMQ can manage retries itself.
 *  - The server starts BullMQ only after the main Redis client is ready. The
 *    ioredis offline queue remains enabled so queue commands issued during a
 *    short reconnect do not fail startup.
 */

import IORedis from 'ioredis'
import { config } from './index'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Namespace prefix for every BullMQ key in Redis. */
export const BULLMQ_KEY_PREFIX = 'moviehub:bull'

// ─── Singleton connection ─────────────────────────────────────────────────────

let bullConnection: IORedis | null = null

/**
 * Returns (and lazily creates) the shared IORedis connection used by all
 * BullMQ Queues and Workers in this process.
 *
 * Returns `null` when Redis is not configured (mirrors the graceful-skip
 * pattern used by the cache layer).
 */
export function getBullMQConnection(): IORedis | null {
  if (bullConnection) return bullConnection

  if (!config.redisUrl) {
    console.warn('[BullMQ] REDIS_URL is not set — BullMQ is disabled.')
    return null
  }

  bullConnection = new IORedis(config.redisUrl, {
    // Required by BullMQ — must be null to disable the ioredis retry cap.
    maxRetriesPerRequest: null,
    // Keep the default offline queue behavior so startup and short reconnects
    // do not fail with "Stream isn't writeable" before Redis is ready.
    enableOfflineQueue: true,
    // Keepalive to avoid idle-connection drops on managed Redis services.
    keepAlive: 10_000,
  })

  bullConnection.on('connect', () => console.log('[BullMQ] Redis connecting…'))
  bullConnection.on('ready', () => console.log('[BullMQ] Redis connection ready'))
  bullConnection.on('error', (err: Error) => console.error('[BullMQ] Redis error:', err.message))
  bullConnection.on('close', () => console.warn('[BullMQ] Redis connection closed'))
  bullConnection.on('reconnecting', () => console.warn('[BullMQ] Redis reconnecting…'))

  return bullConnection
}

/**
 * Gracefully closes the shared BullMQ Redis connection.
 * Call this during process shutdown after all Workers have been closed.
 */
export async function disconnectBullMQ(): Promise<void> {
  if (!bullConnection) return
  try {
    await bullConnection.quit()
  } finally {
    bullConnection = null
  }
}
