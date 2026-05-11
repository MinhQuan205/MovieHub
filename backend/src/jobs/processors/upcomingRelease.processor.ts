/**
 * upcomingRelease.processor.ts — BullMQ Worker for Scheduled Movie Release Notifications
 */

import { Worker, type Job } from 'bullmq'
import type { Types } from 'mongoose'
import { getBullMQConnection, BULLMQ_KEY_PREFIX } from '../../config/bullmq'
import { WatchlistModel } from '../../models/Watchlist.model'
import { UserModel } from '../../models/User.model'
import { tmdbService } from '../../services/tmdb.service'
import { createNotification } from '../../modules/notifications/notifications.service'
import {
  SCHEDULED_QUEUE_NAME,
  UPCOMING_RELEASE_JOB_NAME,
} from '../queues/scheduledQueue'
import logger from '../../utils/logger'

export interface ScheduledJobData {
  task: typeof UPCOMING_RELEASE_JOB_NAME
}

type WatchlistMovieLean = {
  tmdbId: number
  tmdbTitle: string
}

type WatchlistReleaseLeanDoc = {
  userId: Types.ObjectId
  movies: WatchlistMovieLean[]
}

type UserTokensLeanDoc = {
  _id: Types.ObjectId
  fcmTokens?: string[]
}

function getUtcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function buildNotificationBody(movieTitles: string[]): string {
  const body = `Releasing today: ${movieTitles.join(', ')}`
  if (body.length <= 1000) return body

  return `${body.slice(0, 997)}...`
}

async function processUpcomingReleaseJob(job: Job<ScheduledJobData>): Promise<void> {
  if (job.name !== UPCOMING_RELEASE_JOB_NAME) {
    logger.warn('[UpcomingReleaseWorker] Unknown job type — discarding', {
      jobId: job.id,
      jobName: job.name,
    })
    return
  }

  const today = getUtcDateString()
  const [pageOne, pageTwo] = await Promise.all([
    tmdbService.getUpcoming(1),
    tmdbService.getUpcoming(2),
  ])

  const releasingToday = [...pageOne.results, ...pageTwo.results].filter((movie) => movie.release_date === today)

  if (releasingToday.length === 0) {
    logger.info('[UpcomingReleaseWorker] No movies releasing today', { date: today })
    return
  }

  const movieTitleById = new Map<number, string>()
  for (const movie of releasingToday) {
    movieTitleById.set(movie.id, movie.title)
  }

  const tmdbIds = Array.from(movieTitleById.keys())
  const watchlists = await WatchlistModel.find(
    { 'movies.tmdbId': { $in: tmdbIds } },
    { userId: 1, movies: 1 }
  ).lean<WatchlistReleaseLeanDoc[]>()

  if (watchlists.length === 0) {
    logger.info('[UpcomingReleaseWorker] No watchlists matched today releases', {
      date: today,
      movieCount: releasingToday.length,
    })
    return
  }

  const moviesByUserId = new Map<string, Map<number, string>>()
  for (const watchlist of watchlists) {
    const userId = watchlist.userId.toString()
    const userMovies = moviesByUserId.get(userId) ?? new Map<number, string>()

    for (const movie of watchlist.movies) {
      const title = movieTitleById.get(movie.tmdbId)
      if (title) userMovies.set(movie.tmdbId, title)
    }

    moviesByUserId.set(userId, userMovies)
  }

  const userIds = Array.from(moviesByUserId.keys())
  const users = await UserModel.find(
    { _id: { $in: userIds }, fcmTokens: { $exists: true, $ne: [] } },
    { fcmTokens: 1 }
  ).lean<UserTokensLeanDoc[]>()

  const usersWithTokens = new Set(users.map((user) => user._id.toString()))
  let notifiedUsers = 0

  for (const [userId, movies] of moviesByUserId.entries()) {
    if (!usersWithTokens.has(userId)) continue

    const movieTitles = Array.from(movies.values())
    const movieIds = Array.from(movies.keys()).map(String)

    await createNotification(
      userId,
      'movie_release',
      'Movies releasing today',
      buildNotificationBody(movieTitles),
      {
        movieIds: movieIds.join(','),
      }
    )

    notifiedUsers += 1
  }

  logger.info('[UpcomingReleaseWorker] Upcoming release notifications completed', {
    date: today,
    releaseCount: releasingToday.length,
    matchedUsers: moviesByUserId.size,
    notifiedUsers,
  })
}

let upcomingReleaseWorker: Worker<ScheduledJobData> | null = null

export function startUpcomingReleaseWorker(): Worker<ScheduledJobData> | null {
  if (upcomingReleaseWorker) return upcomingReleaseWorker

  const connection = getBullMQConnection()
  if (!connection) {
    logger.warn('[UpcomingReleaseWorker] BullMQ connection unavailable — worker not started')
    return null
  }

  upcomingReleaseWorker = new Worker<ScheduledJobData>(SCHEDULED_QUEUE_NAME, processUpcomingReleaseJob, {
    connection,
    prefix: BULLMQ_KEY_PREFIX,
    concurrency: 1,
  })

  upcomingReleaseWorker.on('completed', (job) => {
    logger.info('[UpcomingReleaseWorker] Job completed', {
      jobId: job.id,
      jobName: job.name,
      durationMs: job.processedOn ? Date.now() - job.processedOn : undefined,
    })
  })

  upcomingReleaseWorker.on('failed', (job, err) => {
    logger.error('[UpcomingReleaseWorker] Job failed', {
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })
  })

  upcomingReleaseWorker.on('error', (err) => {
    logger.error('[UpcomingReleaseWorker] Worker error', { error: err.message })
  })

  logger.info(`[UpcomingReleaseWorker] Worker started for queue '${SCHEDULED_QUEUE_NAME}' (concurrency: 1)`)

  return upcomingReleaseWorker
}

export async function stopUpcomingReleaseWorker(force = false): Promise<void> {
  if (!upcomingReleaseWorker) return

  try {
    await upcomingReleaseWorker.close(force)
    logger.info('[UpcomingReleaseWorker] Worker stopped gracefully')
  } finally {
    upcomingReleaseWorker = null
  }
}
