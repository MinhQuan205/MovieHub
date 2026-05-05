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

import reviewsRoutes from './reviews.routes'
import { errorHandler } from '../../middleware/errorHandler'
import { UserModel } from '../../models/User.model'
import { ReviewModel } from '../../models/Review.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from '../../models/testDb'
import { generateAccessToken } from '../../utils/jwt'

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', reviewsRoutes)
  app.use(errorHandler)
  return app
}

async function createAuthHeader(email: string): Promise<string> {
  const user = await UserModel.create({
    email,
    passwordHash: 'hashed-password',
    displayName: 'Review User',
  })

  return `Bearer ${generateAccessToken({ sub: user._id.toString() })}`
}

describe('review CRUD API', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await Promise.all([UserModel.init(), ReviewModel.init()])
  })

  beforeEach(async () => {
    await clearTestDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('creates and lists reviews for a movie', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader('reviewer@example.com')

    const createRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', authHeader)
      .send({ rating: 9, content: 'Excellent movie' })

    expect(createRes.status).toBe(201)
    expect(createRes.body).toMatchObject({
      success: true,
      data: {
        review: {
          id: expect.any(String),
          tmdbMovieId: 550,
          rating: 9,
          content: 'Excellent movie',
          likes: [],
          status: 'active',
        },
      },
    })

    const listRes = await request(app).get('/api/v1/movies/550/reviews')

    expect(listRes.status).toBe(200)
    expect(listRes.body.success).toBe(true)
    expect(listRes.body.data.reviews).toHaveLength(1)
    expect(listRes.body.data.reviews[0]).toMatchObject({
      tmdbMovieId: 550,
      rating: 9,
      content: 'Excellent movie',
    })
  })

  it('requires auth for create, update, and delete', async () => {
    const app = createTestApp()

    const createRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .send({ rating: 8, content: 'Needs auth' })

    expect(createRes.status).toBe(401)
  })

  it('rejects duplicate reviews for the same user and movie', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader('duplicate@example.com')

    await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', authHeader)
      .send({ rating: 8, content: 'First review' })

    const duplicateRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', authHeader)
      .send({ rating: 7, content: 'Second review' })

    expect(duplicateRes.status).toBe(409)
    expect(duplicateRes.body.error.code).toBe('REVIEW_ALREADY_EXISTS')
  })

  it('updates and deletes only the owner review', async () => {
    const app = createTestApp()
    const ownerAuthHeader = await createAuthHeader('owner@example.com')
    const otherAuthHeader = await createAuthHeader('other-reviewer@example.com')

    const createRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', ownerAuthHeader)
      .send({ rating: 6, content: 'Original review' })

    const reviewId = String(createRes.body.data.review.id)

    const forbiddenUpdateRes = await request(app)
      .put(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', otherAuthHeader)
      .send({ rating: 10 })

    expect(forbiddenUpdateRes.status).toBe(403)

    const updateRes = await request(app)
      .put(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', ownerAuthHeader)
      .send({ rating: 8, content: 'Updated review' })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.review).toMatchObject({
      id: reviewId,
      rating: 8,
      content: 'Updated review',
    })

    const forbiddenDeleteRes = await request(app)
      .delete(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', otherAuthHeader)

    expect(forbiddenDeleteRes.status).toBe(403)

    const deleteRes = await request(app)
      .delete(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', ownerAuthHeader)

    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body).toEqual({ success: true, data: {} })
    await expect(ReviewModel.findById(reviewId)).resolves.toBeNull()
  })

  it('toggles review like for the authenticated user', async () => {
    const app = createTestApp()
    const ownerAuthHeader = await createAuthHeader('like-owner@example.com')
    const likerAuthHeader = await createAuthHeader('liker@example.com')

    const createRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', ownerAuthHeader)
      .send({ rating: 9, content: 'Likeable review' })

    const reviewId = String(createRes.body.data.review.id)

    const likeRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/like`)
      .set('Authorization', likerAuthHeader)

    expect(likeRes.status).toBe(200)
    expect(likeRes.body).toEqual({
      success: true,
      data: {
        reviewId,
        action: 'liked',
        totalLikes: 1,
      },
    })

    const unlikeRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/like`)
      .set('Authorization', likerAuthHeader)

    expect(unlikeRes.status).toBe(200)
    expect(unlikeRes.body).toEqual({
      success: true,
      data: {
        reviewId,
        action: 'unliked',
        totalLikes: 0,
      },
    })
  })

  it('reports a review and keeps repeated reports idempotent', async () => {
    const app = createTestApp()
    const ownerAuthHeader = await createAuthHeader('report-owner@example.com')
    const reporterAuthHeader = await createAuthHeader('reporter@example.com')

    const createRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', ownerAuthHeader)
      .send({ rating: 3, content: 'Problematic review' })

    const reviewId = String(createRes.body.data.review.id)

    const reportRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Authorization', reporterAuthHeader)

    expect(reportRes.status).toBe(200)
    expect(reportRes.body).toEqual({
      success: true,
      message: 'Review reported successfully',
    })

    const reportedReview = await ReviewModel.findById(reviewId).lean()
    expect(reportedReview?.status).toBe('reported')

    const secondReportRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Authorization', reporterAuthHeader)

    expect(secondReportRes.status).toBe(200)
    expect(secondReportRes.body).toEqual({
      success: true,
      message: 'Review reported successfully',
    })
  })

  it('prevents reporting your own review', async () => {
    const app = createTestApp()
    const ownerAuthHeader = await createAuthHeader('self-report-owner@example.com')

    const createRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', ownerAuthHeader)
      .send({ rating: 5, content: 'Own review' })

    const reviewId = String(createRes.body.data.review.id)

    const reportRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Authorization', ownerAuthHeader)

    expect(reportRes.status).toBe(400)
    expect(reportRes.body.error.code).toBe('CANNOT_REPORT_OWN_REVIEW')
  })

  it('validates rating, content length, and ids', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader('validation-reviewer@example.com')

    const invalidRatingRes = await request(app)
      .post('/api/v1/movies/550/reviews')
      .set('Authorization', authHeader)
      .send({ rating: 11, content: 'Invalid rating' })

    expect(invalidRatingRes.status).toBe(400)
    expect(invalidRatingRes.body.error.code).toBe('VALIDATION_ERROR')

    const invalidMovieIdRes = await request(app)
      .get('/api/v1/movies/not-a-number/reviews')

    expect(invalidMovieIdRes.status).toBe(400)
    expect(invalidMovieIdRes.body.error.code).toBe('VALIDATION_ERROR')

    const invalidReviewIdRes = await request(app)
      .put('/api/v1/reviews/not-an-object-id')
      .set('Authorization', authHeader)
      .send({ content: 'Valid content' })

    expect(invalidReviewIdRes.status).toBe(400)
    expect(invalidReviewIdRes.body.error.code).toBe('VALIDATION_ERROR')

    const invalidReportIdRes = await request(app)
      .post('/api/v1/reviews/not-an-object-id/report')
      .set('Authorization', authHeader)

    expect(invalidReportIdRes.status).toBe(400)
    expect(invalidReportIdRes.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when reporting a missing review', async () => {
    const app = createTestApp()
    const authHeader = await createAuthHeader('missing-report-reviewer@example.com')

    const missingReviewId = '64f000000000000000000000'
    const reportRes = await request(app)
      .post(`/api/v1/reviews/${missingReviewId}/report`)
      .set('Authorization', authHeader)

    expect(reportRes.status).toBe(404)
    expect(reportRes.body.error.code).toBe('REVIEW_NOT_FOUND')
  })
})
