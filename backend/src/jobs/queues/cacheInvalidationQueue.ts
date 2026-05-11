/**
 * cacheInvalidationQueue.ts - BullMQ queue for TMDB cache invalidation jobs.
 */

import { Queue } from 'bullmq'
import { BULLMQ_KEY_PREFIX, getBullMQConnection } from '../../config/bullmq'
import logger from '../../utils/logger'

export const CACHE_INVALIDATION_QUEUE_NAME = 'cache-invalidation'
export const CACHE_INVALIDATION_JOB_NAME = 'cache_invalidation'
export const CACHE_INVALIDATION_CRON = '*/5 * * * *'
export const CACHE_INVALIDATION_REPEAT_JOB_ID = 'cache-invalidation-every-5-minutes'

export interface CacheInvalidationJobData {
  task: typeof CACHE_INVALIDATION_JOB_NAME
}

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1_000,
  },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { count: 100 },
}

let cacheInvalidationQueue: Queue<CacheInvalidationJobData> | null = null

export function getCacheInvalidationQueue(): Queue<CacheInvalidationJobData> | null {
  if (cacheInvalidationQueue) return cacheInvalidationQueue

  const connection = getBullMQConnection()
  if (!connection) {
    logger.warn('[CacheInvalidationQueue] BullMQ connection unavailable - queue disabled')
    return null
  }

  cacheInvalidationQueue = new Queue<CacheInvalidationJobData>(CACHE_INVALIDATION_QUEUE_NAME, {
    connection,
    prefix: BULLMQ_KEY_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })

  cacheInvalidationQueue.on('error', (err) => {
    logger.error('[CacheInvalidationQueue] Queue error', { err: err.message })
  })

  logger.info(`[CacheInvalidationQueue] Queue '${CACHE_INVALIDATION_QUEUE_NAME}' initialized`)

  return cacheInvalidationQueue
}

export async function scheduleCacheInvalidationJob(): Promise<void> {
  const queue = getCacheInvalidationQueue()
  if (!queue) {
    logger.warn('[CacheInvalidationQueue] Skipping cache invalidation schedule - queue is disabled')
    return
  }

  await queue.add(
    CACHE_INVALIDATION_JOB_NAME,
    { task: CACHE_INVALIDATION_JOB_NAME },
    {
      jobId: CACHE_INVALIDATION_REPEAT_JOB_ID,
      repeat: {
        pattern: CACHE_INVALIDATION_CRON,
      },
    }
  )

  logger.info('[CacheInvalidationQueue] Cache invalidation job scheduled', {
    jobId: CACHE_INVALIDATION_REPEAT_JOB_ID,
    cron: CACHE_INVALIDATION_CRON,
  })
}
