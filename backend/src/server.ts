import { createServer, type Server as HttpServer } from 'node:http'
import app from './app'
import { config } from './config'
import { connectDatabase, disconnectDatabase } from './config/database'
import { connectRedis, disconnectRedis, isRedisConnected } from './config/redis'
import { connectElasticsearch, disconnectElasticsearch } from './config/elasticsearch'
import { initializeSocketServer } from './sockets/socket.server'
import { disconnectFirebaseAdmin, getFirebaseAdmin } from './config/firebase'
import { disconnectBullMQ } from './config/bullmq'
import { startNotificationWorker, stopNotificationWorker } from './jobs/processors/notification.processor'
import { scheduleUpcomingReleaseJob } from './jobs/queues/scheduledQueue'
import { startUpcomingReleaseWorker, stopUpcomingReleaseWorker } from './jobs/processors/upcomingRelease.processor'
import { scheduleCacheInvalidationJob } from './jobs/queues/cacheInvalidationQueue'
import {
  startCacheInvalidationWorker,
  stopCacheInvalidationWorker,
} from './jobs/processors/cacheInvalidation.processor'
import { bootstrapSearchIndex } from './services/search-index.bootstrap'

let server: HttpServer | null = null
let shuttingDown = false

async function startBullMQInfrastructure(): Promise<void> {
  if (!isRedisConnected()) {
    console.warn('[BullMQ] Redis is not connected, skipping queue workers')
    return
  }

  startNotificationWorker()
  startUpcomingReleaseWorker()
  startCacheInvalidationWorker()
  await scheduleUpcomingReleaseJob()
  await scheduleCacheInvalidationJob()
}

async function closeHttpServer(): Promise<void> {
  if (!server) return

  await new Promise<void>((resolve, reject) => {
    server?.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })

  server = null
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`Received ${signal}, shutting down...`)

  try {
    // Stop accepting HTTP traffic first, then drain workers before closing
    // shared infrastructure clients.
    await closeHttpServer()
    await stopNotificationWorker()
    await stopUpcomingReleaseWorker()
    await stopCacheInvalidationWorker()
    await disconnectBullMQ()
    await disconnectFirebaseAdmin()
    await disconnectRedis()
    await disconnectElasticsearch()
    await disconnectDatabase()
    process.exit(0)
  } catch (err) {
    console.error('Graceful shutdown failed:', err)
    process.exit(1)
  }
}

async function cleanupAfterBootstrapFailure(): Promise<void> {
  await Promise.allSettled([
    stopNotificationWorker(true),
    stopUpcomingReleaseWorker(true),
    stopCacheInvalidationWorker(true),
    closeHttpServer(),
    disconnectBullMQ(),
    disconnectFirebaseAdmin(),
    disconnectRedis(),
    disconnectElasticsearch(),
    disconnectDatabase(),
  ])
}

async function bootstrap() {
  await connectDatabase()
  await connectRedis()
  await connectElasticsearch()
  await bootstrapSearchIndex()

  // ── Firebase Admin SDK ──────────────────────────────────────────────────
  const firebaseApp = getFirebaseAdmin()
  if (firebaseApp) {
    console.log('[Firebase] Admin SDK initialized successfully')
  } else {
    console.warn('[Firebase] Configuration missing, running in skip mode')
  }

  // ── BullMQ Workers ───────────────────────────────────────────────────────
  await startBullMQInfrastructure()

  server = createServer(app)
  initializeSocketServer(server)

  server.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}${config.apiPrefix}/health`)
  })
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

bootstrap().catch(async (err) => {
  console.error('Failed to start server:', err)
  await cleanupAfterBootstrapFailure()
  process.exit(1)
})
