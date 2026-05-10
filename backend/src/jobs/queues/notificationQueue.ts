/**
 * notificationQueue.ts — BullMQ Notification Queue Definition
 *
 * Responsibilities:
 *  - Defines the single 'notifications' queue shared by all producers
 *    (controllers, event emitters, cron jobs).
 *  - Applies project-wide default job options: 3 attempts with exponential
 *    back-off starting at 1 second, covering transient FCM / network errors.
 *  - Reuses the shared IORedis connection from Group 1 (getBullMQConnection)
 *    and the BULLMQ_KEY_PREFIX to ensure proper key namespacing.
 *  - Returns null gracefully when Redis is unavailable so the app can start
 *    in degraded mode without crashing.
 */

import { Queue } from 'bullmq'
import { getBullMQConnection, BULLMQ_KEY_PREFIX } from '../../config/bullmq'
import type { NotificationJobData } from '../processors/notification.processor'
import logger from '../../utils/logger'

// ─── Constants ────────────────────────────────────────────────────────────────

export const NOTIFICATION_QUEUE_NAME = 'notifications'

// ─── Default job options ──────────────────────────────────────────────────────

/**
 * Retry policy applied to every job added to this queue unless overridden
 * at the individual addJob() call-site.
 *
 *  attempts : 3   → 1 original attempt + 2 retries
 *  backoff  : exponential, starting at 1 s → delays: 1 s, 2 s, 4 s, …
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1_000,
  },
  // Remove completed jobs after 24 h to avoid unbounded Redis growth.
  removeOnComplete: { age: 60 * 60 * 24 },
  // Keep the last 100 failed jobs for post-mortem inspection.
  removeOnFail: { count: 100 },
}

// ─── Singleton queue ──────────────────────────────────────────────────────────

let notificationQueue: Queue<NotificationJobData> | null = null

/**
 * Returns the singleton notification queue, creating it on first call.
 *
 * Returns `null` when the BullMQ Redis connection is unavailable so that
 * callers can implement their own degraded-mode logic.
 */
export function getNotificationQueue(): Queue<NotificationJobData> | null {
  if (notificationQueue) return notificationQueue

  const connection = getBullMQConnection()
  if (!connection) {
    logger.warn('[NotificationQueue] BullMQ connection unavailable — queue disabled')
    return null
  }

  notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
    connection,
    prefix: BULLMQ_KEY_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })

  notificationQueue.on('error', (err) => {
    logger.error('[NotificationQueue] Queue error', { err: err.message })
  })

  logger.info(`[NotificationQueue] Queue '${NOTIFICATION_QUEUE_NAME}' initialized`)

  return notificationQueue
}

/**
 * Convenience helper: enqueue a push_notification job.
 *
 * Returns the created Job, or `null` when the queue is disabled.
 */
export async function enqueueNotification(
  data: NotificationJobData,
  opts?: { delay?: number; priority?: number }
) {
  const queue = getNotificationQueue()
  if (!queue) {
    logger.warn('[NotificationQueue] Skipping enqueue — queue is disabled', { userId: data.userId })
    return null
  }

  const jobOptions: { delay?: number; priority?: number } = {}
  if (opts?.delay !== undefined) jobOptions.delay = opts.delay
  if (opts?.priority !== undefined) jobOptions.priority = opts.priority

  return queue.add('push_notification', data, jobOptions)
}
