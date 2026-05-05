import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  addMovieController,
  createWatchlistController,
  deleteWatchlistController,
  getWatchlistsController,
  removeMovieController,
  updateWatchlistController,
} from './watchlist.controller'
import {
  addMovieSchema,
  createWatchlistSchema,
  tmdbIdParamSchema,
  updateWatchlistSchema,
  watchlistIdParamSchema,
} from './watchlist.validation'

const router = Router()

// All watchlist routes require a valid JWT
// requireAuth populates req.user from the Bearer token

router.get('/watchlists', requireAuth, getWatchlistsController)

router.post('/watchlists', requireAuth, validate(createWatchlistSchema), createWatchlistController)

router.put(
  '/watchlists/:id',
  requireAuth,
  validate(watchlistIdParamSchema, 'params'),
  validate(updateWatchlistSchema),
  updateWatchlistController
)

router.delete(
  '/watchlists/:id',
  requireAuth,
  validate(watchlistIdParamSchema, 'params'),
  deleteWatchlistController
)

router.post(
  '/watchlists/:id/movies',
  requireAuth,
  validate(watchlistIdParamSchema, 'params'),
  validate(addMovieSchema),
  addMovieController
)

router.delete(
  '/watchlists/:id/movies/:tmdbId',
  requireAuth,
  validate(tmdbIdParamSchema, 'params'),
  removeMovieController
)

export default router
