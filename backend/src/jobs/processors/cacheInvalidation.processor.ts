/**
 * cacheInvalidation.processor.ts — BullMQ processor for TMDB movie cache invalidation.
 */

import axios from 'axios'
import { Worker, type Job } from 'bullmq'
import { config } from '../../config'
import { getBullMQConnection, BULLMQ_KEY_PREFIX } from '../../config/bullmq'
import { getRedisClient, isRedisConnected } from '../../config/redis'
import {
  CACHE_INVALIDATION_JOB_NAME,
  CACHE_INVALIDATION_QUEUE_NAME,
  type CacheInvalidationJobData,
} from '../queues/cacheInvalidationQueue'
import logger from '../../utils/logger'

const LAST_RUN_KEY = 'job:cacheInvalidation:lastRun'
const CACHE_KEY_PREFIX = 'moviehub:cache:'
const FIVE_MINUTES_MS = 5 * 60 * 1000

interface TmdbMovieChangesResponse {
  results: Array<{
    id: number
    adult?: boolean
  }>
  page: number
  total_pages: number
  total_results: number
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function fetchMovieChanges(startDate: Date, endDate: Date, page: number): Promise<TmdbMovieChangesResponse> {
  const response = await axios.get<TmdbMovieChangesResponse>('/movie/changes', {
    baseURL: config.tmdb.baseUrl,
    timeout: 8000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.tmdb.apiKey}`,
    },
    params: {
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      page,
    },
  })

  return response.data
}

async function fetchAllMovieChanges(startDate: Date, endDate: Date): Promise<TmdbMovieChangesResponse['results']> {
  const firstPage = await fetchMovieChanges(startDate, endDate, 1)
  const results = [...firstPage.results]

  for (let page = 2; page <= firstPage.total_pages; page += 1) {
    const response = await fetchMovieChanges(startDate, endDate, page)
    results.push(...response.results)
  }

  return results
}

async function scanKeys(pattern: string): Promise<string[]> {
  const client = getRedisClient()
  const keys: string[] = []
  let cursor = '0'

  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = nextCursor
    keys.push(...batch)
  } while (cursor !== '0')

  return keys
}

async function deleteKeysByPhysicalPattern(physicalPattern: string): Promise<number> {
  const keys = await scanKeys(physicalPattern)
  if (keys.length === 0) return 0

  const logicalKeys = keys.map((key) => (key.startsWith(CACHE_KEY_PREFIX) ? key.slice(CACHE_KEY_PREFIX.length) : key))
  const pipeline = getRedisClient().pipeline()

  for (const key of logicalKeys) {
    pipeline.del(key)
  }

  const results = await pipeline.exec()
  if (!results) return 0

  return results.reduce((deletedCount, [err, result]) => {
    if (err) throw err
    return deletedCount + (typeof result === 'number' ? result : 0)
  }, 0)
}

async function invalidateMovieCache(movieIds: number[]): Promise<number> {
  let keysDeleted = 0

  for (const movieId of movieIds) {
    keysDeleted += await deleteKeysByPhysicalPattern(`${CACHE_KEY_PREFIX}tmdb:movie:${movieId}:*`)
  }

  return keysDeleted
}

async function processCacheInvalidationJob(job: Job<CacheInvalidationJobData>): Promise<void> {
  if (job.name !== CACHE_INVALIDATION_JOB_NAME) {
    logger.warn('[CacheInvalidationWorker] Unknown job type — discarding', {
      jobId: job.id,
      jobName: job.name,
    })
    return
  }

  const startedAt = new Date()
  const startedMs = Date.now()

  logger.info('[CacheInvalidationWorker] Job started', {
    jobId: job.id,
    startedAt: startedAt.toISOString(),
  })

  try {
    if (!isRedisConnected()) {
      throw new Error('Redis client is not ready')
    }

    const redis = getRedisClient()
    const lastRunValue = await redis.get(LAST_RUN_KEY)
    const lastRunAt = lastRunValue ? new Date(lastRunValue) : null
    const startDate = lastRunAt && !Number.isNaN(lastRunAt.getTime())
      ? lastRunAt
      : new Date(startedAt.getTime() - FIVE_MINUTES_MS)

    if (lastRunAt && startedAt.getTime() - lastRunAt.getTime() < FIVE_MINUTES_MS) {
      logger.info('[CacheInvalidationWorker] Skipping duplicate run', {
        lastRunAt: lastRunAt.toISOString(),
        durationMs: Date.now() - startedMs,
      })
      return
    }

    const changedMovies = await fetchAllMovieChanges(startDate, startedAt)
    const changedMovieIds = Array.from(new Set(changedMovies.map((movie) => movie.id)))
    const keysDeleted = await invalidateMovieCache(changedMovieIds)

    await redis.set(LAST_RUN_KEY, startedAt.toISOString())

    logger.info('[CacheInvalidationWorker] Job completed', {
      startedAt: startedAt.toISOString(),
      startDate: startDate.toISOString(),
      endDate: startedAt.toISOString(),
      tmdbResponseCount: changedMovies.length,
      changedMovieCount: changedMovieIds.length,
      keysDeleted,
      durationMs: Date.now() - startedMs,
    })
  } catch (err) {
    logger.error('[CacheInvalidationWorker] Job failed', {
      jobId: job.id,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedMs,
      error: getErrorMessage(err),
    })
    throw err
  }
}

let cacheInvalidationWorker: Worker<CacheInvalidationJobData> | null = null

export function startCacheInvalidationWorker(): Worker<CacheInvalidationJobData> | null {
  if (cacheInvalidationWorker) return cacheInvalidationWorker

  const connection = getBullMQConnection()
  if (!connection) {
    logger.warn('[CacheInvalidationWorker] BullMQ connection unavailable — worker not started')
    return null
  }

  cacheInvalidationWorker = new Worker<CacheInvalidationJobData>(CACHE_INVALIDATION_QUEUE_NAME, processCacheInvalidationJob, {
    connection,
    prefix: BULLMQ_KEY_PREFIX,
    concurrency: 1,
  })

  cacheInvalidationWorker.on('completed', (job) => {
    logger.info('[CacheInvalidationWorker] BullMQ job completed', {
      jobId: job.id,
      jobName: job.name,
      durationMs: job.processedOn ? Date.now() - job.processedOn : undefined,
    })
  })

  cacheInvalidationWorker.on('failed', (job, err) => {
    logger.error('[CacheInvalidationWorker] BullMQ job failed', {
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })
  })

  cacheInvalidationWorker.on('error', (err) => {
    logger.error('[CacheInvalidationWorker] Worker error', { error: err.message })
  })

  logger.info(`[CacheInvalidationWorker] Worker started for queue '${CACHE_INVALIDATION_QUEUE_NAME}' (concurrency: 1)`)

  return cacheInvalidationWorker
}

export async function stopCacheInvalidationWorker(force = false): Promise<void> {
  if (!cacheInvalidationWorker) return

  try {
    await cacheInvalidationWorker.close(force)
    logger.info('[CacheInvalidationWorker] Worker stopped gracefully')
  } finally {
    cacheInvalidationWorker = null
  }
}
