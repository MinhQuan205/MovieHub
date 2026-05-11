/**
 * notification.processor.ts — BullMQ Worker for Push Notifications
 *
 * Architecture decisions:
 *  - Single Worker consumes the 'notifications' queue and dispatches jobs by
 *    their `name` field, allowing this processor to be extended for future
 *    job types (e.g., 'in_app_notification', 'digest_email') without adding
 *    new queues or workers.
 *  - `concurrency: 5` — processes up to 5 jobs simultaneously.  Tune this
 *    value based on FCM rate limits and available DB connection pool size.
 *  - The Worker reuses the shared IORedis connection via `.duplicate()` which
 *    is called internally by BullMQ for its blocking BRPOP operations, so
 *    we do NOT pass a separate connection instance.
 *  - Observability: completed / failed lifecycle listeners emit structured
 *    log entries compatible with Winston JSON format.
 */

import { Worker, type Job } from 'bullmq'
import { getBullMQConnection, BULLMQ_KEY_PREFIX } from '../../config/bullmq'
import {
  FcmPayloadValidationError,
  fcmService,
  type FcmNotificationPayload,
} from '../../services/fcm.service'
import { NOTIFICATION_QUEUE_NAME } from '../queues/notificationQueue'
import logger from '../../utils/logger'

// ─── Job payload type ─────────────────────────────────────────────────────────

/**
 * Strict shape enforced for every job added to the 'notifications' queue.
 * Keeping this interface in the processor file (and re-exporting it) ensures
 * the queue definition and the processor always agree on the payload shape.
 */
export interface NotificationJobData {
  /** MongoDB ObjectId string of the target user. */
  userId: string
  title: string
  body: string
  data?: Record<string, string>
}

// ─── Supported job names ──────────────────────────────────────────────────────

const JOB_TYPES = {
  PUSH_NOTIFICATION: 'push_notification',
} as const

// ─── Worker processor function ────────────────────────────────────────────────

/**
 * Core processor function executed for every dequeued job.
 * BullMQ will retry this function according to the queue's default job options
 * (3 attempts, exponential backoff) if it throws.
 */
async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const { userId, title, body, data } = job.data

  switch (job.name) {
    case JOB_TYPES.PUSH_NOTIFICATION: {
      logger.info('[NotificationWorker] Processing push_notification job', {
        jobId: job.id,
        userId,
        attempt: job.attemptsMade + 1,
      })

      try {
        const content: FcmNotificationPayload = {
          title,
          body,
          ...(data ? { data } : {}),
        }

        await fcmService.sendToUser(userId, content)
      } catch (err) {
        if (err instanceof FcmPayloadValidationError) {
          logger.warn('[NotificationWorker] Non-retryable FCM payload error — discarding job', {
            jobId: job.id,
            userId,
            error: err.message,
          })
          return
        }
        throw err
      }
      break
    }

    default:
      // Unknown job types are logged and silently discarded so they do not
      // consume retry budget or block the queue.
      logger.warn('[NotificationWorker] Unknown job type — discarding', {
        jobId: job.id,
        jobName: job.name,
      })
  }
}

// ─── Worker singleton ─────────────────────────────────────────────────────────

let notificationWorker: Worker<NotificationJobData> | null = null

/**
 * Initialise and return the notification worker singleton.
 *
 * Returns `null` when the BullMQ Redis connection is unavailable so the
 * bootstrap process can continue in degraded mode.
 */
export function startNotificationWorker(): Worker<NotificationJobData> | null {
  if (notificationWorker) return notificationWorker

  const connection = getBullMQConnection()
  if (!connection) {
    logger.warn('[NotificationWorker] BullMQ connection unavailable — worker not started')
    return null
  }

  notificationWorker = new Worker<NotificationJobData>(NOTIFICATION_QUEUE_NAME, processNotificationJob, {
    connection,
    prefix: BULLMQ_KEY_PREFIX,
    // Maximum concurrent jobs this worker processes at once.
    // Adjust based on FCM throughput limits and MongoDB connection pool size.
    concurrency: 5,
  })

  // ── Lifecycle listeners ─────────────────────────────────────────────────

  notificationWorker.on('completed', (job) => {
    logger.info('[NotificationWorker] Job completed', {
      jobId: job.id,
      jobName: job.name,
      userId: job.data.userId,
      durationMs: job.processedOn ? Date.now() - job.processedOn : undefined,
    })
  })

  notificationWorker.on('failed', (job, err) => {
    logger.error('[NotificationWorker] Job failed', {
      jobId: job?.id,
      jobName: job?.name,
      userId: job?.data?.userId,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })
  })

  notificationWorker.on('error', (err) => {
    // Worker-level errors (connection issues, serialization errors).
    logger.error('[NotificationWorker] Worker error', { error: err.message })
  })

  logger.info(`[NotificationWorker] Worker started for queue '${NOTIFICATION_QUEUE_NAME}' (concurrency: 5)`)

  return notificationWorker
}

/**
 * Gracefully shut down the notification worker.
 * Pass `force: true` to immediately terminate without draining active jobs
 * (use only during hard-shutdown scenarios).
 */
export async function stopNotificationWorker(force = false): Promise<void> {
  if (!notificationWorker) return

  try {
    await notificationWorker.close(force)
    logger.info('[NotificationWorker] Worker stopped gracefully')
  } finally {
    notificationWorker = null
  }
}
