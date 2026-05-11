import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express'
import { requireAdmin } from '../middleware/auth.middleware'
import { getNotificationQueue } from '../jobs/queues/notificationQueue'
import { getScheduledQueue } from '../jobs/queues/scheduledQueue'
import { getCacheInvalidationQueue } from '../jobs/queues/cacheInvalidationQueue'
import { isRedisConnected } from '../config/redis'
import logger from '../utils/logger'

const QUEUE_DASHBOARD_PATH = '/admin/queues'
let registered = false
let dashboardRouter: RequestHandler | null = null

function isInternalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function queueDashboardAccess(req: Request, res: Response, next: NextFunction): void {
  if (isInternalRequest(req)) {
    next()
    return
  }

  requireAdmin(req, res, next)
}

export function registerQueueDashboard(app: Express): void {
  if (registered) return

  app.use(QUEUE_DASHBOARD_PATH, queueDashboardAccess, (req, res, next) => {
    if (!dashboardRouter) {
      if (!isRedisConnected()) {
        res.status(503).json({
          success: false,
          message: 'Queue dashboard is unavailable because Redis is not connected',
        })
        return
      }

      const notificationQueue = getNotificationQueue()
      const scheduledQueue = getScheduledQueue()
      const cacheInvalidationQueue = getCacheInvalidationQueue()
      const queues = [notificationQueue, scheduledQueue, cacheInvalidationQueue].filter((queue) => queue !== null)

      if (queues.length === 0) {
        res.status(503).json({
          success: false,
          message: 'Queue dashboard is unavailable because BullMQ is not connected',
        })
        return
      }

      const serverAdapter = new ExpressAdapter()
      serverAdapter.setBasePath(QUEUE_DASHBOARD_PATH)

      createBullBoard({
        queues: queues.map((queue) => new BullMQAdapter(queue)),
        serverAdapter,
      })

      dashboardRouter = serverAdapter.getRouter()
      logger.info(`[BullBoard] Queue dashboard initialized at ${QUEUE_DASHBOARD_PATH}`)
    }

    const router = dashboardRouter
    if (!router) {
      res.status(503).json({
        success: false,
        message: 'Queue dashboard is unavailable',
      })
      return
    }

    router(req, res, next)
  })

  registered = true
  logger.info(`[BullBoard] Queue dashboard route mounted at ${QUEUE_DASHBOARD_PATH}`)
}
