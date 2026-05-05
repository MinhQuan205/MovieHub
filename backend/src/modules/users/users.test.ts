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

jest.mock('../../services/s3.service', () => ({
  uploadAvatarToS3: jest.fn(async () => 'https://cdn.moviehub.test/avatar.jpg'),
}))

import usersRoutes from './users.routes'
import { errorHandler } from '../../middleware/errorHandler'
import { UserModel } from '../../models/User.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from '../../models/testDb'
import { uploadAvatarToS3 } from '../../services/s3.service'
import { generateAccessToken } from '../../utils/jwt'

const mockedUploadAvatarToS3 = uploadAvatarToS3 as jest.MockedFunction<typeof uploadAvatarToS3>

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/users', usersRoutes)
  app.use(errorHandler)
  return app
}

async function createAuthHeader(): Promise<string> {
  const user = await UserModel.create({
    email: 'profile@example.com',
    passwordHash: 'hashed-password',
    displayName: 'Profile User',
    isVerified: true,
    isEmailVerified: true,
  })

  return `Bearer ${generateAccessToken({ sub: user._id.toString() })}`
}

describe('users profile API', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await UserModel.init()
  })

  beforeEach(async () => {
    await clearTestDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('returns the authenticated user profile without passwordHash', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader()

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', authHeader)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      message: 'OK',
      data: {
        profile: {
          id: expect.any(String),
          email: 'profile@example.com',
          displayName: 'Profile User',
          provider: 'local',
          isVerified: true,
          role: 'user',
          preferences: {
            language: 'vi',
            theme: 'system',
            favoriteGenres: [],
          },
        },
      },
    })
    expect(res.body.data.profile.passwordHash).toBeUndefined()
  })

  it('updates display name and preferences only', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader()

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', authHeader)
      .send({
        displayName: 'Updated Profile',
        preferences: {
          language: 'en',
          theme: 'dark',
          favoriteGenres: [28, 35],
        },
        role: 'admin',
      })

    expect(res.status).toBe(200)
    expect(res.body.data.profile).toMatchObject({
      displayName: 'Updated Profile',
      role: 'user',
      preferences: {
        language: 'en',
        theme: 'dark',
        favoriteGenres: [28, 35],
      },
    })
  })

  it('updates avatar after a valid upload', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader()

    const res = await request(app)
      .post('/api/users/avatar')
      .set('Authorization', authHeader)
      .attach('avatar', Buffer.from([0xff, 0xd8, 0xff, 0x00]), {
        filename: 'avatar.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      data: { avatar: 'https://cdn.moviehub.test/avatar.jpg' },
      message: 'OK',
    })
    expect(mockedUploadAvatarToS3).toHaveBeenCalledTimes(1)

    const user = await UserModel.findOne({ email: 'profile@example.com' }).lean()
    expect(user?.avatar).toBe('https://cdn.moviehub.test/avatar.jpg')
  })

  it('returns 400 when avatar file is missing', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader()

    const res = await request(app)
      .post('/api/users/avatar')
      .set('Authorization', authHeader)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'AVATAR_FILE_REQUIRED',
        message: 'Avatar file is required',
      },
    })
  })

  it('returns 400 for unsupported avatar mime type', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader()

    const res = await request(app)
      .post('/api/users/avatar')
      .set('Authorization', authHeader)
      .attach('avatar', Buffer.from('not an image'), {
        filename: 'avatar.txt',
        contentType: 'text/plain',
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INVALID_AVATAR_TYPE',
        message: 'Avatar must be a JPEG, PNG, or WebP image',
      },
    })
  })
})
