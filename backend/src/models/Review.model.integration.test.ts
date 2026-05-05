import mongoose from 'mongoose'
import { ReviewModel } from './Review.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './testDb'

jest.setTimeout(60000)

describe('ReviewModel integration', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await ReviewModel.init()
  })

  afterEach(async () => {
    await clearTestDatabase()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('enforces unique userId + tmdbMovieId', async () => {
    const userId = new mongoose.Types.ObjectId()

    await ReviewModel.create({
      userId,
      tmdbMovieId: 100,
      rating: 8,
      content: 'Great movie',
    })

    await expect(
      ReviewModel.create({
        userId,
        tmdbMovieId: 100,
        rating: 9,
        content: 'Still great',
      })
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('validates rating range from 1 to 10', async () => {
    await expect(
      ReviewModel.create({
        userId: new mongoose.Types.ObjectId(),
        tmdbMovieId: 101,
        rating: 11,
        content: 'Out of range',
      })
    ).rejects.toThrow()
  })
})
