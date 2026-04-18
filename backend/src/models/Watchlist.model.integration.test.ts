import mongoose from 'mongoose'
import { UserModel } from './User.model'
import { WatchlistModel } from './Watchlist.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './testDb'

jest.setTimeout(60000)

describe('WatchlistModel integration', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await Promise.all([UserModel.init(), WatchlistModel.init()])
  })

  afterEach(async () => {
    await clearTestDatabase()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('enforces unique shareSlug', async () => {
    const userId = new mongoose.Types.ObjectId()

    await WatchlistModel.create({
      userId,
      name: 'Watchlist A',
      shareSlug: 'same-slug-1',
    })

    await expect(
      WatchlistModel.create({
        userId,
        name: 'Watchlist B',
        shareSlug: 'same-slug-1',
      })
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('validates watchlist name max length', async () => {
    const userId = new mongoose.Types.ObjectId()

    await expect(
      WatchlistModel.create({
        userId,
        name: 'x'.repeat(51),
      })
    ).rejects.toThrow()
  })

  it('has index for userId and movies.tmdbId', () => {
    const indexes = WatchlistModel.schema.indexes()

    expect(
      indexes.some((index: [Record<string, number>, Record<string, unknown>]) => {
        const fields = index[0] as Record<string, number>
        return fields.userId === 1 && fields['movies.tmdbId'] === 1
      })
    ).toBe(true)
  })
})
