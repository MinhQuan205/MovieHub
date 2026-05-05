import type { Types } from 'mongoose'
import { ReviewModel } from '../../models/Review.model'
import { io } from '../../sockets/socket.server'
import { REVIEW_SOCKET_EVENTS, type ReviewLikedPayload } from '../../sockets/watchlist.socket'
import { AppError } from '../../utils/AppError'

export interface CreateReviewDto {
  rating: number
  content?: string
}

export interface UpdateReviewDto {
  rating?: number
  content?: string
}

export interface ReviewDto {
  id: string
  userId: string
  tmdbMovieId: number
  rating: number
  content: string
  likes: string[]
  status: 'active' | 'hidden' | 'reported'
  createdAt: Date
  updatedAt: Date
}

export interface ToggleReviewLikeResult {
  reviewId: string
  action: 'liked' | 'unliked'
  totalLikes: number
}

type ReviewLeanDoc = {
  _id: Types.ObjectId
  userId: Types.ObjectId
  tmdbMovieId: number
  rating: number
  content?: string
  likes: Types.ObjectId[]
  status: 'active' | 'hidden' | 'reported'
  createdAt: Date
  updatedAt: Date
}

type ReviewLikeDocument = {
  _id: Types.ObjectId
  userId: Types.ObjectId
  likes: Types.ObjectId[]
  save: () => Promise<unknown>
}

type ReviewReportDocument = {
  _id: Types.ObjectId
  userId: Types.ObjectId
  status: 'active' | 'hidden' | 'reported'
  save: () => Promise<unknown>
}

function toDto(doc: ReviewLeanDoc): ReviewDto {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    tmdbMovieId: doc.tmdbMovieId,
    rating: doc.rating,
    content: doc.content ?? '',
    likes: doc.likes.map((userId) => userId.toString()),
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function findOwnedReview(reviewId: string, userId: string): Promise<ReviewLeanDoc> {
  const review = await ReviewModel.findById(reviewId).lean<ReviewLeanDoc>()

  if (!review) {
    throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND')
  }

  if (review.userId.toString() !== userId) {
    throw new AppError('You do not have permission to modify this review', 403, 'FORBIDDEN')
  }

  return review
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

export async function createReview(
  userId: string,
  tmdbMovieId: number,
  dto: CreateReviewDto
): Promise<ReviewDto> {
  try {
    const review = await ReviewModel.create({
      userId,
      tmdbMovieId,
      rating: dto.rating,
      content: dto.content ?? '',
    })

    const lean = await ReviewModel.findById(review._id).lean<ReviewLeanDoc>()
    if (!lean) throw new AppError('Review creation failed', 500, 'INTERNAL_ERROR')

    return toDto(lean)
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError('You have already reviewed this movie', 409, 'REVIEW_ALREADY_EXISTS')
    }

    throw error
  }
}

export async function getReviewsByMovie(tmdbMovieId: number): Promise<ReviewDto[]> {
  const reviews = await ReviewModel.find({ tmdbMovieId, status: 'active' })
    .sort({ createdAt: -1 })
    .lean<ReviewLeanDoc[]>()

  return reviews.map(toDto)
}

export async function updateReview(
  reviewId: string,
  userId: string,
  dto: UpdateReviewDto
): Promise<ReviewDto> {
  await findOwnedReview(reviewId, userId)

  const updated = await ReviewModel.findByIdAndUpdate(
    reviewId,
    { $set: dto },
    { returnDocument: 'after', runValidators: true }
  ).lean<ReviewLeanDoc>()

  if (!updated) throw new AppError('Review not found after update', 404, 'REVIEW_NOT_FOUND')

  return toDto(updated)
}

export async function deleteReview(reviewId: string, userId: string): Promise<void> {
  await findOwnedReview(reviewId, userId)

  const deleted = await ReviewModel.findByIdAndDelete(reviewId).lean<ReviewLeanDoc>()
  if (!deleted) throw new AppError('Review not found after delete', 404, 'REVIEW_NOT_FOUND')
}

export async function toggleReviewLike(
  reviewId: string,
  userId: string
): Promise<ToggleReviewLikeResult> {
  const review = await ReviewModel.findById(reviewId).select('_id userId likes')

  if (!review) {
    throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND')
  }

  const reviewDoc = review as unknown as ReviewLikeDocument
  const alreadyLiked = reviewDoc.likes.some((likedUserId) => likedUserId.toString() === userId)
  const action: ToggleReviewLikeResult['action'] = alreadyLiked ? 'unliked' : 'liked'

  if (alreadyLiked) {
    reviewDoc.likes = reviewDoc.likes.filter((likedUserId) => likedUserId.toString() !== userId)
  } else {
    reviewDoc.likes.push(userId as unknown as Types.ObjectId)
  }

  await reviewDoc.save()

  const payload: ReviewLikedPayload = {
    reviewId: reviewDoc._id.toString(),
    userId,
    action,
    totalLikes: reviewDoc.likes.length,
  }

  if (io) {
    io.to(reviewDoc.userId.toString()).emit(REVIEW_SOCKET_EVENTS.LIKED, payload)
    console.log(`[SOCKET] review:liked → review ${reviewId}`)
  }

  return {
    reviewId: payload.reviewId,
    action: payload.action,
    totalLikes: payload.totalLikes,
  }
}

export async function reportReview({
  userId,
  reviewId,
}: {
  userId: string
  reviewId: string
}): Promise<void> {
  const review = await ReviewModel.findById(reviewId).select('_id userId status')

  if (!review) {
    throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND')
  }

  const reviewDoc = review as unknown as ReviewReportDocument

  if (reviewDoc.userId.toString() === userId) {
    throw new AppError('You cannot report your own review', 400, 'CANNOT_REPORT_OWN_REVIEW')
  }

  if (reviewDoc.status === 'reported') {
    return
  }

  reviewDoc.status = 'reported'
  await reviewDoc.save()
}
