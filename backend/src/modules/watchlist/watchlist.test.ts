import express from 'express'
import request from 'supertest'

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

import watchlistRoutes from './watchlist.routes'
import { errorHandler } from '../../middleware/errorHandler'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from '../../models/testDb'
import { UserModel } from '../../models/User.model'
import { WatchlistModel } from '../../models/Watchlist.model'
import { generateAccessToken } from '../../utils/jwt'

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', watchlistRoutes)
  app.use(errorHandler)
  return app
}

async function createAuthHeader(email: string): Promise<string> {
  const user = await UserModel.create({
    email,
    passwordHash: 'hashed-password',
    displayName: 'Test User',
  })

  return `Bearer ${generateAccessToken({ sub: user._id.toString() })}`
}

describe('watchlist CRUD API', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await Promise.all([UserModel.init(), WatchlistModel.init()])
  })

  beforeEach(async () => {
    await clearTestDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('requires authentication', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/watchlists')

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    })
  })

  it('creates, lists, updates, and deletes a watchlist owned by the user', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader('owner@example.com')

    const createRes = await request(app)
      .post('/api/v1/watchlists')
      .set('Authorization', authHeader)
      .send({ name: 'Weekend Picks', isPublic: true })

    expect(createRes.status).toBe(201)
    expect(createRes.body.data.watchlist).toMatchObject({
      id: expect.any(String),
      name: 'Weekend Picks',
      isPublic: true,
      shareSlug: expect.any(String),
      movieCount: 0,
    })
    expect(createRes.body.data.watchlist.movies).toBeUndefined()

    const watchlistId = String(createRes.body.data.watchlist.id)

    const listRes = await request(app)
      .get('/api/v1/watchlists')
      .set('Authorization', authHeader)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.watchlists).toHaveLength(1)
    expect(listRes.body.data.watchlists[0]).toMatchObject({ id: watchlistId })

    const updateRes = await request(app)
      .put(`/api/v1/watchlists/${watchlistId}`)
      .set('Authorization', authHeader)
      .send({ name: 'Updated Picks', isPublic: false })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.watchlist).toMatchObject({
      id: watchlistId,
      name: 'Updated Picks',
      isPublic: false,
    })

    const deleteRes = await request(app)
      .delete(`/api/v1/watchlists/${watchlistId}`)
      .set('Authorization', authHeader)

    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body).toMatchObject({ success: true, message: 'WATCHLIST_DELETED' })
    await expect(WatchlistModel.findById(watchlistId)).resolves.toBeNull()
  })

  it('rejects invalid payloads and invalid ids', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader('validation@example.com')

    const createRes = await request(app)
      .post('/api/v1/watchlists')
      .set('Authorization', authHeader)
      .send({ name: '' })

    expect(createRes.status).toBe(400)
    expect(createRes.body.error.code).toBe('VALIDATION_ERROR')

    const updateRes = await request(app)
      .put('/api/v1/watchlists/not-an-object-id')
      .set('Authorization', authHeader)
      .send({ name: 'Valid Name' })

    expect(updateRes.status).toBe(400)
    expect(updateRes.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('prevents users from updating another user watchlist', async () => {
    const app = createTestApp()
    const ownerAuthHeader = await createAuthHeader('owner-2@example.com')
    const otherAuthHeader = await createAuthHeader('other@example.com')

    const createRes = await request(app)
      .post('/api/v1/watchlists')
      .set('Authorization', ownerAuthHeader)
      .send({ name: 'Private List' })

    const watchlistId = String(createRes.body.data.watchlist.id)

    const updateRes = await request(app)
      .put(`/api/v1/watchlists/${watchlistId}`)
      .set('Authorization', otherAuthHeader)
      .send({ name: 'Hijacked' })

    expect(updateRes.status).toBe(403)
    expect(updateRes.body.error.code).toBe('FORBIDDEN')
  })
})
