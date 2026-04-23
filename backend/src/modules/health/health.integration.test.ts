import express from 'express'
import request from 'supertest'
import { Router } from 'express'

jest.mock('../../config/index', () => ({
  config: {
    health: {
      strictReadiness: true,
    },
  },
}))

jest.mock('../../config/redis', () => ({
  isRedisConnected: jest.fn(),
}))

jest.mock('../../config/database', () => ({
  isDatabaseConnected: jest.fn(),
}))

import { isRedisConnected } from '../../config/redis'
import { isDatabaseConnected } from '../../config/database'
import { getHealth } from './health.controller'

const mockedIsRedisConnected = isRedisConnected as jest.MockedFunction<typeof isRedisConnected>
const mockedIsDatabaseConnected = isDatabaseConnected as jest.MockedFunction<typeof isDatabaseConnected>

function createTestApp() {
  const app = express()
  const router = Router()

  router.get('/health', getHealth)
  app.use('/api/v1', router)

  return app
}

describe('health integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 200 and redis connected when dependency is healthy', async () => {
    mockedIsRedisConnected.mockReturnValue(true)
    mockedIsDatabaseConnected.mockReturnValue(true)

    const app = createTestApp()
    const response = await request(app).get('/api/v1/health')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('ok')
    expect(response.body.data.readiness).toBe('ready')
    expect(response.body.data.dependencies.mongodb).toBe('connected')
    expect(response.body.data.dependencies.redis).toBe('connected')
  })

  it('returns 503 and redis disconnected when strict readiness is enabled', async () => {
    mockedIsRedisConnected.mockReturnValue(false)
    mockedIsDatabaseConnected.mockReturnValue(true)

    const app = createTestApp()
    const response = await request(app).get('/api/v1/health')

    expect(response.status).toBe(503)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('down')
    expect(response.body.data.readiness).toBe('not-ready')
    expect(response.body.data.dependencies.mongodb).toBe('connected')
    expect(response.body.data.dependencies.redis).toBe('disconnected')
  })

  it('returns 503 and mongodb disconnected when strict readiness is enabled', async () => {
    mockedIsRedisConnected.mockReturnValue(true)
    mockedIsDatabaseConnected.mockReturnValue(false)

    const app = createTestApp()
    const response = await request(app).get('/api/v1/health')

    expect(response.status).toBe(503)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('down')
    expect(response.body.data.readiness).toBe('not-ready')
    expect(response.body.data.dependencies.mongodb).toBe('disconnected')
    expect(response.body.data.dependencies.redis).toBe('connected')
  })
})
