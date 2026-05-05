import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  createReviewController,
  deleteReviewController,
  getReviewsByMovieController,
  reportReviewController,
  toggleReviewLikeController,
  updateReviewController,
} from './reviews.controller'
import {
  createReviewSchema,
  movieIdParamSchema,
  reviewIdParamSchema,
  updateReviewSchema,
} from './reviews.validation'

const router = Router()

router.get(
  '/movies/:id/reviews',
  validate(movieIdParamSchema, 'params'),
  getReviewsByMovieController
)

router.post(
  '/movies/:id/reviews',
  requireAuth,
  validate(movieIdParamSchema, 'params'),
  validate(createReviewSchema),
  createReviewController
)

router.put(
  '/reviews/:id',
  requireAuth,
  validate(reviewIdParamSchema, 'params'),
  validate(updateReviewSchema),
  updateReviewController
)

router.post(
  '/reviews/:id/like',
  requireAuth,
  validate(reviewIdParamSchema, 'params'),
  toggleReviewLikeController
)

router.post(
  '/reviews/:id/report',
  requireAuth,
  validate(reviewIdParamSchema, 'params'),
  reportReviewController
)

router.delete(
  '/reviews/:id',
  requireAuth,
  validate(reviewIdParamSchema, 'params'),
  deleteReviewController
)

export default router
