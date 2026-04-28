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
    email: {
      sendGridApiKey: 'SG.test-key',
      from: 'noreply@moviehub.test',
      mobileDeepLinkUrl: 'moviehub://auth',
    },
  },
}))

jest.mock('../../services/email.service', () => ({
  sendVerificationEmail: jest.fn(),
  sendResetPasswordEmail: jest.fn(),
}))

jest.mock('../../services/redis.service', () => {
  const store = new Map<string, { value: string; expiresAt?: number }>()

  function getRecord(key: string): { value: string; expiresAt?: number } | null {
    const record = store.get(key)
    if (!record) return null

    if (record.expiresAt && record.expiresAt <= Date.now()) {
      store.delete(key)
      return null
    }

    return record
  }

  const redisService = {
    async get(key: string): Promise<string | null> {
      const record = getRecord(key)
      return record ? record.value : null
    },
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
      const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined
      if (typeof expiresAt === 'number') {
        store.set(key, { value, expiresAt })
        return
      }

      store.set(key, { value })
    },
    async del(key: string): Promise<number> {
      const hasKey = store.delete(key)
      return hasKey ? 1 : 0
    },
    async exists(key: string): Promise<boolean> {
      return getRecord(key) !== null
    },
    async ttl(key: string): Promise<number> {
      const record = getRecord(key)
      if (!record) return -2
      if (!record.expiresAt) return -1
      return Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
    },
    async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined
      const serialized = JSON.stringify(value)

      if (typeof expiresAt === 'number') {
        store.set(key, { value: serialized, expiresAt })
        return
      }

      store.set(key, { value: serialized })
    },
    async getJson<T>(key: string): Promise<T | null> {
      const record = getRecord(key)
      if (!record) return null
      return JSON.parse(record.value) as T
    },
  }

  const redisKeys = {
    authAccessBlacklist: (jti: string) => `auth:blacklist:access:${jti}`,
    authRefresh: (userId: string, tokenId: string) => `auth:refresh:${userId}:${tokenId}`,
    authEmailVerify: (token: string) => `auth:email-verify:${token}`,
    authPasswordReset: (token: string) => `auth:password-reset:${token}`,
    authTask: (task: 'verify' | 'reset', tokenHash: string) => `auth:task:${task}:${tokenHash}`,
  }

  return {
    redisService,
    redisKeys,
    __redisStore: store,
  }
})

import authRoutes from './auth.routes'
import { errorHandler } from '../../middleware/errorHandler'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from '../../models/testDb'
import { UserModel } from '../../models/User.model'
import { sendResetPasswordEmail, sendVerificationEmail } from '../../services/email.service'

const mockedSendVerificationEmail = sendVerificationEmail as jest.MockedFunction<typeof sendVerificationEmail>
const mockedSendResetPasswordEmail = sendResetPasswordEmail as jest.MockedFunction<typeof sendResetPasswordEmail>

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', authRoutes)
  app.use(errorHandler)
  return app
}

function extractRefreshCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined
  const refreshCookie = setCookie?.find((cookie) => cookie.startsWith('refreshToken='))

  if (!refreshCookie) {
    throw new Error('Missing refreshToken cookie in response')
  }

  const cookieHeader = refreshCookie.split(';')[0]
  if (!cookieHeader) {
    throw new Error('Invalid refreshToken cookie format')
  }

  return cookieHeader
}

describe('auth integration flow', () => {
  let verificationToken = ''
  let resetToken = ''

  beforeAll(async () => {
    await connectTestDatabase()
    await UserModel.init()
  })

  beforeEach(async () => {
    const redisStore = (
      jest.requireMock('../../services/redis.service') as {
        __redisStore: Map<string, { value: string; expiresAt?: number }>
      }
    ).__redisStore

    await clearTestDatabase()
    redisStore.clear()
    jest.clearAllMocks()
    verificationToken = ''
    resetToken = ''

    mockedSendVerificationEmail.mockImplementation(async (_email: string, token: string) => {
      verificationToken = token
    })

    mockedSendResetPasswordEmail.mockImplementation(async (_email: string, token: string) => {
      resetToken = token
    })
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('handles register -> verify -> login -> forgot -> reset -> logout flow', async () => {
    const app = createTestApp()

    const registerResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'flow@example.com',
      password: 'Password123',
      displayName: 'Flow User',
    })

    expect(registerResponse.status).toBe(201)
    expect(registerResponse.body.success).toBe(true)
    expect(registerResponse.body.data.user.email).toBe('flow@example.com')
    expect(verificationToken).toBeTruthy()

    const verifyResponse = await request(app).get(`/api/v1/auth/verify-email/${verificationToken}`)

    expect(verifyResponse.status).toBe(200)
    expect(verifyResponse.body.success).toBe(true)

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'flow@example.com',
      password: 'Password123',
    })

    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body.success).toBe(true)

    const forgotResponse = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'flow@example.com',
    })

    expect(forgotResponse.status).toBe(200)
    expect(forgotResponse.body.success).toBe(true)
    expect(resetToken).toBeTruthy()

    const resetResponse = await request(app).post(`/api/v1/auth/reset-password/${resetToken}`).send({
      password: 'NewPassword123',
    })

    expect(resetResponse.status).toBe(200)
    expect(resetResponse.body.success).toBe(true)

    const oldPasswordLoginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'flow@example.com',
      password: 'Password123',
    })

    expect(oldPasswordLoginResponse.status).toBe(401)

    const newPasswordLoginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'flow@example.com',
      password: 'NewPassword123',
    })

    expect(newPasswordLoginResponse.status).toBe(200)

    const accessToken = String(newPasswordLoginResponse.body.data.accessToken)
    const refreshCookie = extractRefreshCookie(newPasswordLoginResponse)

    const meResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(meResponse.status).toBe(200)
    expect(meResponse.body.data.user).toMatchObject({
      email: 'flow@example.com',
      displayName: 'Flow User',
      role: 'user',
      isEmailVerified: true,
      preferences: {
        language: 'vi',
        theme: 'system',
        favoriteGenres: [],
      },
    })

    const logoutResponse = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie)

    expect(logoutResponse.status).toBe(200)
    expect(logoutResponse.body.success).toBe(true)

    const meAfterLogoutResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(meAfterLogoutResponse.status).toBe(401)
  })

  it('verifies email through query token endpoint used by email links', async () => {
    const app = createTestApp()

    const registerResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'query-verify@example.com',
      password: 'Password123',
      displayName: 'Query Verify User',
    })

    expect(registerResponse.status).toBe(201)
    expect(verificationToken).toBeTruthy()

    const verifyResponse = await request(app).get('/api/v1/auth/verify-email').query({ token: verificationToken })

    expect(verifyResponse.status).toBe(200)
    expect(verifyResponse.body.success).toBe(true)

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'query-verify@example.com',
      password: 'Password123',
    })

    const accessToken = String(loginResponse.body.data.accessToken)

    const meResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(meResponse.status).toBe(200)
    expect(meResponse.body.data.user.isEmailVerified).toBe(true)
  })
})
