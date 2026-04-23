import express from 'express'
import request from 'supertest'

jest.mock('../config/index', () => ({
  config: {
    apiPrefix: '/api/v1',
    health: {
      strictReadiness: false,
    },
    rateLimit: {
      windowSeconds: 60,
      maxRequests: 2,
      authWindowSeconds: 60,
      authMaxRequests: 1,
    },
  },
}))

jest.mock('../config/redis', () => ({
  isRedisConnected: jest.fn(),
  getRedisClient: jest.fn(),
}))

import { getRedisClient, isRedisConnected } from '../config/redis'
import { rateLimitMiddleware } from './rateLimit.middleware'

type MockRedisClient = {
  incr: jest.Mock<Promise<number>, [string]>
  expire: jest.Mock<Promise<number>, [string, number]>
  ttl: jest.Mock<Promise<number>, [string]>
}

const mockedIsRedisConnected = isRedisConnected as jest.MockedFunction<typeof isRedisConnected>
const mockedGetRedisClient = getRedisClient as jest.MockedFunction<typeof getRedisClient>

function createTestApp() {
  const app = express()

  app.use(rateLimitMiddleware)
  app.get('/movies', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  return app
}

describe('rate limit integration', () => {
  let mockClient: MockRedisClient

  beforeEach(() => {
    jest.clearAllMocks()

    mockClient = {
      incr: jest.fn(),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(30),
    }

    mockedIsRedisConnected.mockReturnValue(true)
    mockedGetRedisClient.mockReturnValue(mockClient as unknown as ReturnType<typeof getRedisClient>)
  })

  it('returns 200 when request count is within limit', async () => {
    mockClient.incr.mockResolvedValue(1)

    const app = createTestApp()
    const response = await request(app).get('/movies')

    expect(response.status).toBe(200)
    expect(response.headers['x-ratelimit-limit']).toBe('2')
    expect(response.headers['x-ratelimit-remaining']).toBe('1')
  })

  it('returns 429 when request count exceeds limit', async () => {
    mockClient.incr.mockResolvedValue(3)

    const app = createTestApp()
    const response = await request(app).get('/movies')

    expect(response.status).toBe(429)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('TOO_MANY_REQUESTS')
    expect(response.headers['retry-after']).toBe('30')
  })

  it('uses stricter bucket for auth routes', async () => {
    mockClient.incr.mockResolvedValue(2)

    const app = express()
    app.use(rateLimitMiddleware)
    app.post('/api/v1/auth/login', (_req, res) => {
      res.status(200).json({ ok: true })
    })

    const response = await request(app).post('/api/v1/auth/login')

    expect(response.status).toBe(429)
    expect(mockClient.incr).toHaveBeenCalledWith(expect.stringContaining('rate-limit:auth:'))
    expect(response.headers['x-ratelimit-limit']).toBe('1')
  })
})
