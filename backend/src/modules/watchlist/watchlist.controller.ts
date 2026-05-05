import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { apiResponse } from '../../utils/apiResponse'
import { AppError } from '../../utils/AppError'
import {
  addMovieToWatchlist,
  createWatchlist,
  deleteWatchlist,
  getUserWatchlists,
  removeMovieFromWatchlist,
  updateWatchlist,
  type CreateWatchlistDto,
  type UpdateWatchlistDto,
  type WatchlistMovieDto,
} from './watchlist.service'

function requireUserId(req: Request): string {
  const id = req.user?.id
  if (!id) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  return id
}

// GET /api/v1/watchlists
export const getWatchlistsController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const watchlists = await getUserWatchlists(userId)

  res.status(200).json(apiResponse.success({ watchlists }, 'WATCHLISTS_FETCHED'))
})

// POST /api/v1/watchlists
export const createWatchlistController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const dto = req.body as CreateWatchlistDto

  const watchlist = await createWatchlist(userId, dto)

  res.status(201).json(apiResponse.success({ watchlist }, 'WATCHLIST_CREATED'))
})

// PUT /api/v1/watchlists/:id
export const updateWatchlistController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const watchlistId = req.params.id as string
  const dto = req.body as UpdateWatchlistDto

  const watchlist = await updateWatchlist(watchlistId, userId, dto)

  res.status(200).json(apiResponse.success({ watchlist }, 'WATCHLIST_UPDATED'))
})

// DELETE /api/v1/watchlists/:id
export const deleteWatchlistController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const watchlistId = req.params.id as string

  await deleteWatchlist(watchlistId, userId)

  res.status(200).json(apiResponse.success({}, 'WATCHLIST_DELETED'))
})

// POST /api/v1/watchlists/:id/movies
export const addMovieController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const watchlistId = req.params.id as string
  const dto = req.body as WatchlistMovieDto

  const watchlist = await addMovieToWatchlist(watchlistId, userId, dto)

  res.status(201).json(apiResponse.success({ watchlist }, 'MOVIE_ADDED_TO_WATCHLIST'))
})

// DELETE /api/v1/watchlists/:id/movies/:tmdbId
export const removeMovieController = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const watchlistId = req.params.id as string
  const tmdbId = Number(req.params.tmdbId)

  if (isNaN(tmdbId)) {
    throw new AppError('Invalid tmdbId', 400, 'INVALID_TMDB_ID')
  }

  const watchlist = await removeMovieFromWatchlist(watchlistId, userId, tmdbId)

  res.status(200).json(apiResponse.success({ watchlist }, 'MOVIE_REMOVED_FROM_WATCHLIST'))
})
