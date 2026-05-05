import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'
import {
  createReview,
  deleteReview,
  getReviewsByMovie,
  reportReview,
  toggleReviewLike,
  updateReview,
  type CreateReviewDto,
  type UpdateReviewDto,
} from './reviews.service'

function requireUserId(req: Request): string {
  const userId = req.user?.id
  if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  return userId
}

export const createReviewController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const tmdbMovieId = Number(req.params.id)
  const dto = req.body as CreateReviewDto

  const review = await createReview(userId, tmdbMovieId, dto)

  res.status(201).json({ success: true, data: { review } })
})

export const getReviewsByMovieController = asyncHandler(async (req: Request, res: Response) => {
  const tmdbMovieId = Number(req.params.id)
  const reviews = await getReviewsByMovie(tmdbMovieId)

  res.status(200).json({ success: true, data: { reviews } })
})

export const updateReviewController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const reviewId = req.params.id as string
  const dto = req.body as UpdateReviewDto

  const review = await updateReview(reviewId, userId, dto)

  res.status(200).json({ success: true, data: { review } })
})

export const deleteReviewController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const reviewId = req.params.id as string

  await deleteReview(reviewId, userId)

  res.status(200).json({ success: true, data: {} })
})

export const toggleReviewLikeController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const reviewId = req.params.id as string

  const result = await toggleReviewLike(reviewId, userId)

  res.status(200).json({ success: true, data: result })
})

export const reportReviewController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const reviewId = req.params.id as string

  await reportReview({ userId, reviewId })

  res.status(200).json({ success: true, message: 'Review reported successfully' })
})
