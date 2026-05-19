import express from 'express'
import request from 'supertest'
import { Types } from 'mongoose'

// ─── Mock config FIRST (before any service imports) ───────────────────────────

jest.mock('../../config', () => ({
  config: {
    nodeEnv: 'test',
    apiPrefix: '/api/v1',
    jwt: {
      accessSecret: 'test-access-secret-1234567890',
      refreshSecret: 'test-refresh-secret-1234567890',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
  },
}))

jest.mock('../../services/redis.service', () => ({
  redisService: {
    exists: jest.fn(async () => false),
  },
  redisKeys: {
    authAccessBlacklist: (jti: string) => `auth:blacklist:access:${jti}`,
  },
}))

// Mock BullMQ / notification queue so no Redis connection is required
jest.mock('../../jobs/queues/notificationQueue', () => ({
  enqueueNotification: jest.fn(async () => null),
  getNotificationQueue: jest.fn(() => null),
}))

// Mock FCM service — no Firebase calls in tests
jest.mock('../../services/fcm.service', () => ({
  fcmService: {
    sendToUser: jest.fn(async () => undefined),
    sendToDevice: jest.fn(async () => undefined),
  },
  FcmPayloadValidationError: class FcmPayloadValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'FcmPayloadValidationError'
    }
  },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import notificationRoutes from './notifications.routes'
import { errorHandler } from '../../middleware/errorHandler'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from '../../models/testDb'
import { UserModel } from '../../models/User.model'
import { NotificationModel } from '../../models/Notification.model'
import { generateAccessToken } from '../../utils/jwt'

// ─── Test App Factory ─────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', notificationRoutes)
  app.use(errorHandler)
  return app
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────

async function createUserWithToken(email: string): Promise<{ userId: string; authHeader: string }> {
  const user = await UserModel.create({
    email,
    passwordHash: 'hashed-password',
    displayName: 'Test User',
  })
  const userId = user._id.toString()
  const authHeader = `Bearer ${generateAccessToken({ sub: userId })}`
  return { userId, authHeader }
}

// ─── Seed Helper ──────────────────────────────────────────────────────────────

async function createNotification(userId: string, overrides: Record<string, unknown> = {}) {
  return NotificationModel.create({
    userId: new Types.ObjectId(userId),
    type: 'system',
    title: 'Test Notification',
    body: 'Test body content',
    isRead: false,
    ...overrides,
  })
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('Notifications API', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await Promise.all([UserModel.init(), NotificationModel.init()])
  })

  beforeEach(async () => {
    await clearTestDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  // ── GET /notifications ────────────────────────────────────────────────────

  describe('GET /api/v1/notifications', () => {
    it('returns 401 without auth token', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/v1/notifications')

      expect(res.status).toBe(401)
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'UNAUTHORIZED' },
      })
    })

    it('returns paginated notifications for the authenticated user only', async () => {
      const app = createTestApp()
      const { userId: userAId, authHeader: userAHeader } = await createUserWithToken('usera@example.com')
      const { userId: userBId } = await createUserWithToken('userb@example.com')

      // Create 3 notifications for user A and 2 for user B
      await createNotification(userAId, { title: 'A-Notif-1' })
      await createNotification(userAId, { title: 'A-Notif-2' })
      await createNotification(userAId, { title: 'A-Notif-3' })
      await createNotification(userBId, { title: 'B-Notif-1' })
      await createNotification(userBId, { title: 'B-Notif-2' })

      const res = await request(app)
        .get('/api/v1/notifications?page=1&limit=10')
        .set('Authorization', userAHeader)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      const { notifications, meta, unreadCount } = res.body.data
      // User A should see only their own 3 notifications
      expect(notifications).toHaveLength(3)
      expect(meta.total).toBe(3)
      expect(unreadCount).toBe(3)

      // Each notification should belong to user A
      notifications.forEach((n: { userId: string }) => {
        expect(n.userId).toBe(userAId)
      })
    })

    it('paginates correctly with page and limit params', async () => {
      const app = createTestApp()
      const { userId, authHeader } = await createUserWithToken('paginate@example.com')

      // Create 5 notifications
      for (let i = 1; i <= 5; i++) {
        await createNotification(userId, { title: `Notif-${i}` })
      }

      const page1 = await request(app)
        .get('/api/v1/notifications?page=1&limit=2')
        .set('Authorization', authHeader)

      expect(page1.status).toBe(200)
      expect(page1.body.data.notifications).toHaveLength(2)
      expect(page1.body.data.meta.total).toBe(5)
      expect(page1.body.data.meta.totalPages).toBe(3)

      const page2 = await request(app)
        .get('/api/v1/notifications?page=2&limit=2')
        .set('Authorization', authHeader)

      expect(page2.status).toBe(200)
      expect(page2.body.data.notifications).toHaveLength(2)
    })

    it('returns empty array when user has no notifications', async () => {
      const app = createTestApp()
      const { authHeader } = await createUserWithToken('empty@example.com')

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', authHeader)

      expect(res.status).toBe(200)
      expect(res.body.data.notifications).toHaveLength(0)
      expect(res.body.data.meta.total).toBe(0)
      expect(res.body.data.unreadCount).toBe(0)
    })
  })

  // ── PUT /notifications/:id/read ───────────────────────────────────────────

  describe('PUT /api/v1/notifications/:id/read', () => {
    it('marks a notification as read for the owner', async () => {
      const app = createTestApp()
      const { userId, authHeader } = await createUserWithToken('reader@example.com')

      const notif = await createNotification(userId)
      expect(notif.isRead).toBe(false)

      const res = await request(app)
        .put(`/api/v1/notifications/${notif._id.toString()}/read`)
        .set('Authorization', authHeader)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.notification.isRead).toBe(true)
      expect(res.body.data.notification.id).toBe(notif._id.toString())
    })

    it('returns 404 when notification does not exist', async () => {
      const app = createTestApp()
      const { authHeader } = await createUserWithToken('notfound@example.com')

      const fakeId = new Types.ObjectId().toString()
      const res = await request(app)
        .put(`/api/v1/notifications/${fakeId}/read`)
        .set('Authorization', authHeader)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOTIFICATION_NOT_FOUND')
    })

    it('enforces ownership guard — user B cannot mark user A notification as read', async () => {
      const app = createTestApp()
      const { userId: userAId } = await createUserWithToken('owner-a@example.com')
      const { authHeader: userBHeader } = await createUserWithToken('other-b@example.com')

      const notif = await createNotification(userAId)

      const res = await request(app)
        .put(`/api/v1/notifications/${notif._id.toString()}/read`)
        .set('Authorization', userBHeader)

      // Ownership guard: user B gets 404 (not found for their userId)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOTIFICATION_NOT_FOUND')
    })

    it('returns 400 for invalid notification id format', async () => {
      const app = createTestApp()
      const { authHeader } = await createUserWithToken('invalidid@example.com')

      const res = await request(app)
        .put('/api/v1/notifications/not-an-object-id/read')
        .set('Authorization', authHeader)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ── PUT /notifications/read-all ───────────────────────────────────────────

  describe('PUT /api/v1/notifications/read-all', () => {
    it('marks all unread notifications as read for the user', async () => {
      const app = createTestApp()
      const { userId, authHeader } = await createUserWithToken('readall@example.com')

      // Create 3 unread notifications
      await createNotification(userId, { isRead: false })
      await createNotification(userId, { isRead: false })
      await createNotification(userId, { isRead: true })

      const res = await request(app)
        .put('/api/v1/notifications/read-all')
        .set('Authorization', authHeader)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // Only 2 were unread — modifiedCount should be 2
      expect(res.body.data.modifiedCount).toBe(2)

      // Verify in DB: all 3 notifications now have isRead = true
      const allNotifs = await NotificationModel.find({ userId })
      expect(allNotifs.every((n) => n.isRead)).toBe(true)
    })

    it('bulk update only affects the authenticated user notifications', async () => {
      const app = createTestApp()
      const { userId: userAId, authHeader: userAHeader } = await createUserWithToken('bulk-a@example.com')
      const { userId: userBId } = await createUserWithToken('bulk-b@example.com')

      await createNotification(userAId, { isRead: false })
      await createNotification(userBId, { isRead: false })
      await createNotification(userBId, { isRead: false })

      const res = await request(app)
        .put('/api/v1/notifications/read-all')
        .set('Authorization', userAHeader)

      expect(res.status).toBe(200)
      expect(res.body.data.modifiedCount).toBe(1)

      // User B's notifications should remain unread
      const userBNotifs = await NotificationModel.find({ userId: userBId })
      expect(userBNotifs.every((n) => !n.isRead)).toBe(true)
    })

    it('returns modifiedCount 0 when all notifications already read', async () => {
      const app = createTestApp()
      const { userId, authHeader } = await createUserWithToken('alreadyread@example.com')

      await createNotification(userId, { isRead: true })
      await createNotification(userId, { isRead: true })

      const res = await request(app)
        .put('/api/v1/notifications/read-all')
        .set('Authorization', authHeader)

      expect(res.status).toBe(200)
      expect(res.body.data.modifiedCount).toBe(0)
    })
  })

  // ── POST /notifications/fcm-token ─────────────────────────────────────────

  describe('POST /api/v1/notifications/fcm-token', () => {
    it('registers an FCM token for the user', async () => {
      const app = createTestApp()
      const { userId, authHeader } = await createUserWithToken('fcm@example.com')

      const token = 'test-fcm-token-abc123'
      const res = await request(app)
        .post('/api/v1/notifications/fcm-token')
        .set('Authorization', authHeader)
        .send({ token })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('FCM_TOKEN_REGISTERED')

      // Verify token stored in DB
      const user = await UserModel.findById(userId).lean()
      expect((user as { fcmTokens?: string[] })?.fcmTokens).toContain(token)
    })

    it('does not create duplicate FCM tokens ($addToSet)', async () => {
      const app = createTestApp()
      const { userId, authHeader } = await createUserWithToken('fcm-dedup@example.com')

      const token = 'duplicate-fcm-token-xyz'

      // Register twice
      await request(app)
        .post('/api/v1/notifications/fcm-token')
        .set('Authorization', authHeader)
        .send({ token })

      await request(app)
        .post('/api/v1/notifications/fcm-token')
        .set('Authorization', authHeader)
        .send({ token })

      // Should only appear once in DB
      const user = await UserModel.findById(userId).lean()
      const fcmTokens = (user as { fcmTokens?: string[] })?.fcmTokens ?? []
      const occurrences = fcmTokens.filter((t) => t === token).length
      expect(occurrences).toBe(1)
    })

    it('returns 400 when token is missing', async () => {
      const app = createTestApp()
      const { authHeader } = await createUserWithToken('fcm-missing@example.com')

      const res = await request(app)
        .post('/api/v1/notifications/fcm-token')
        .set('Authorization', authHeader)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 401 without auth token', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/v1/notifications/fcm-token')
        .send({ token: 'some-token' })

      expect(res.status).toBe(401)
    })
  })

  // ── DELETE /notifications/fcm-token ──────────────────────────────────────

  describe('DELETE /api/v1/notifications/fcm-token', () => {
    it('removes an FCM token from the user', async () => {
      const app = createTestApp()
      const { userId, authHeader } = await createUserWithToken('fcm-remove@example.com')

      const token = 'remove-me-fcm-token'
      // Pre-seed the token
      await UserModel.updateOne({ _id: userId }, { $addToSet: { fcmTokens: token } })

      const res = await request(app)
        .delete('/api/v1/notifications/fcm-token')
        .set('Authorization', authHeader)
        .send({ token })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('FCM_TOKEN_REMOVED')

      const user = await UserModel.findById(userId).lean()
      expect((user as { fcmTokens?: string[] })?.fcmTokens ?? []).not.toContain(token)
    })
  })
})
