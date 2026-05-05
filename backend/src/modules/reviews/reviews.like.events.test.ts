import mongoose from 'mongoose'

const emitMock = jest.fn()
const toMock = jest.fn(() => ({ emit: emitMock }))

jest.mock('../../sockets/socket.server', () => ({
  io: {
    to: toMock,
  },
}))

import { ReviewModel } from '../../models/Review.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from '../../models/testDb'
import { REVIEW_SOCKET_EVENTS } from '../../sockets/watchlist.socket'
import { toggleReviewLike } from './reviews.service'

describe('review like socket events', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await ReviewModel.init()
  })

  beforeEach(async () => {
    await clearTestDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('emits liked and unliked to the review owner after DB save', async () => {
    const ownerId = new mongoose.Types.ObjectId()
    const likerId = new mongoose.Types.ObjectId()
    const review = await ReviewModel.create({
      userId: ownerId,
      tmdbMovieId: 550,
      rating: 9,
      content: 'Socket like review',
    })

    const liked = await toggleReviewLike(review._id.toString(), likerId.toString())

    expect(liked).toEqual({
      reviewId: review._id.toString(),
      action: 'liked',
      totalLikes: 1,
    })
    expect(toMock).toHaveBeenLastCalledWith(ownerId.toString())
    expect(emitMock).toHaveBeenLastCalledWith(REVIEW_SOCKET_EVENTS.LIKED, {
      reviewId: review._id.toString(),
      userId: likerId.toString(),
      action: 'liked',
      totalLikes: 1,
    })

    const persistedLike = await ReviewModel.findById(review._id).lean()
    expect(persistedLike?.likes.map((id: mongoose.Types.ObjectId) => id.toString())).toEqual([
      likerId.toString(),
    ])

    const unliked = await toggleReviewLike(review._id.toString(), likerId.toString())

    expect(unliked).toEqual({
      reviewId: review._id.toString(),
      action: 'unliked',
      totalLikes: 0,
    })
    expect(emitMock).toHaveBeenLastCalledWith(REVIEW_SOCKET_EVENTS.LIKED, {
      reviewId: review._id.toString(),
      userId: likerId.toString(),
      action: 'unliked',
      totalLikes: 0,
    })

    const persistedUnlike = await ReviewModel.findById(review._id).lean()
    expect(persistedUnlike?.likes).toEqual([])
  })
})
