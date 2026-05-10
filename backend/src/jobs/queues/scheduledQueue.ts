/**
 * scheduledQueue.ts — BullMQ Scheduled Job Queue Definition
 */

import { Queue } from 'bullmq'
import { getBullMQConnection, BULLMQ_KEY_PREFIX } from '../../config/bullmq'
import type { ScheduledJobData } from '../processors/upcomingRelease.processor'
import logger from '../../utils/logger'

export const SCHEDULED_QUEUE_NAME = 'scheduled'
export const UPCOMING_RELEASE_JOB_NAME = 'upcoming_movie_release_notify'
export const UPCOMING_RELEASE_REPEAT_JOB_ID = 'upcoming-movie-release-daily'

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1_000,
  },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { count: 100 },
}

let scheduledQueue: Queue<ScheduledJobData> | null = null

export function getScheduledQueue(): Queue<ScheduledJobData> | null {
  if (scheduledQueue) return scheduledQueue

  const connection = getBullMQConnection()
  if (!connection) {
    logger.warn('[ScheduledQueue] BullMQ connection unavailable — queue disabled')
    return null
  }

  scheduledQueue = new Queue<ScheduledJobData>(SCHEDULED_QUEUE_NAME, {
    connection,
    prefix: BULLMQ_KEY_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })

  scheduledQueue.on('error', (err) => {
    logger.error('[ScheduledQueue] Queue error', { err: err.message })
  })

  logger.info(`[ScheduledQueue] Queue '${SCHEDULED_QUEUE_NAME}' initialized`)

  return scheduledQueue
}

export async function scheduleUpcomingReleaseJob(): Promise<void> {
  const queue = getScheduledQueue()
  if (!queue) {
    logger.warn('[ScheduledQueue] Skipping upcoming release schedule — queue is disabled')
    return
  }

  await queue.add(
    UPCOMING_RELEASE_JOB_NAME,
    { task: UPCOMING_RELEASE_JOB_NAME },
    {
      jobId: UPCOMING_RELEASE_REPEAT_JOB_ID,
      repeat: {
        pattern: '0 9 * * *',
      },
    }
  )

  logger.info('[ScheduledQueue] Upcoming release job scheduled', {
    jobId: UPCOMING_RELEASE_REPEAT_JOB_ID,
    cron: '0 9 * * *',
  })
}
