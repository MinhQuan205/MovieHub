import mongoose from 'mongoose'

const emitMock = jest.fn()
const toMock = jest.fn(() => ({ emit: emitMock }))

jest.mock('../../sockets/socket.server', () => ({
  getSocketServer: jest.fn(() => ({
    to: toMock,
  })),
}))

import { WatchlistModel } from '../../models/Watchlist.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from '../../models/testDb'
import { WATCHLIST_SOCKET_EVENTS } from '../../sockets/watchlist.socket'
import {
  addMovieToWatchlist,
  createWatchlist,
  deleteWatchlist,
  removeMovieFromWatchlist,
  updateWatchlist,
} from './watchlist.service'

describe('watchlist service socket events', () => {
  let userId = ''

  beforeAll(async () => {
    await connectTestDatabase()
    await WatchlistModel.init()
  })

  beforeEach(async () => {
    await clearTestDatabase()
    jest.clearAllMocks()
    userId = new mongoose.Types.ObjectId().toString()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('emits created, updated, and deleted after successful DB operations', async () => {
    const created = await createWatchlist(userId, { name: 'Events' })

    expect(toMock).toHaveBeenLastCalledWith(userId)
    expect(emitMock).toHaveBeenLastCalledWith(
      WATCHLIST_SOCKET_EVENTS.CREATED,
      expect.objectContaining({
        watchlistId: created.id,
        action: 'created',
        watchlist: expect.objectContaining({ id: created.id, name: 'Events' }),
      })
    )

    await updateWatchlist(created.id, userId, { name: 'Updated Events' })

    expect(emitMock).toHaveBeenLastCalledWith(
      WATCHLIST_SOCKET_EVENTS.UPDATED,
      expect.objectContaining({
        watchlistId: created.id,
        action: 'updated',
        watchlist: expect.objectContaining({ id: created.id, name: 'Updated Events' }),
      })
    )

    await deleteWatchlist(created.id, userId)

    expect(emitMock).toHaveBeenLastCalledWith(
      WATCHLIST_SOCKET_EVENTS.DELETED,
      expect.objectContaining({
        watchlistId: created.id,
        action: 'deleted',
      })
    )
  })

  it('emits added and removed after successful movie mutations', async () => {
    const created = await createWatchlist(userId, { name: 'Movies' })
    emitMock.mockClear()
    toMock.mockClear()

    await addMovieToWatchlist(created.id, userId, {
      tmdbId: 550,
      tmdbTitle: 'Fight Club',
    })

    expect(emitMock).toHaveBeenCalledTimes(1)
    expect(emitMock).toHaveBeenLastCalledWith(
      WATCHLIST_SOCKET_EVENTS.ADDED,
      expect.objectContaining({
        watchlistId: created.id,
        action: 'added',
        movie: expect.objectContaining({
          tmdbId: 550,
          addedAt: expect.any(String),
        }),
      })
    )

    await expect(
      addMovieToWatchlist(created.id, userId, {
        tmdbId: 550,
        tmdbTitle: 'Fight Club',
      })
    ).rejects.toMatchObject({
      code: 'WATCHLIST_MOVIE_EXISTS',
      statusCode: 409,
    })

    expect(emitMock).toHaveBeenCalledTimes(1)

    await removeMovieFromWatchlist(created.id, userId, 550)

    expect(emitMock).toHaveBeenCalledTimes(2)
    expect(emitMock).toHaveBeenLastCalledWith(
      WATCHLIST_SOCKET_EVENTS.REMOVED,
      expect.objectContaining({
        watchlistId: created.id,
        action: 'removed',
        movie: { tmdbId: 550 },
      })
    )

    await removeMovieFromWatchlist(created.id, userId, 550)

    expect(emitMock).toHaveBeenCalledTimes(2)
  })
})
