import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'
import { apiResponse } from '../../utils/apiResponse'
import { moviesService } from './movies.service'
import type { TrendingWindow } from './movies.service'

// ─────────────────────────────────────────────────────────────
// Helper — safely parse a positive integer from a request value
// ─────────────────────────────────────────────────────────────

function parsePositiveInt(
  value: unknown,
  fallback: number,
  paramName: string
): number {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`"${paramName}" must be a positive integer`, 400, 'VALIDATION_ERROR')
  }
  return parsed
}

// ─────────────────────────────────────────────────────────────
// getTrending  GET /movies/trending?window=day|week&page=1
// ─────────────────────────────────────────────────────────────

export const getTrending = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query['page'], 1, 'page')
  const rawWindow = req.query['window']
  const window: TrendingWindow =
    rawWindow === 'week' ? 'week' : 'day'

  const data = await moviesService.getMovieLists('trending', page, window)
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// getNowPlaying  GET /movies/now-playing?page=1
// ─────────────────────────────────────────────────────────────

export const getNowPlaying = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query['page'], 1, 'page')
  const data = await moviesService.getMovieLists('now_playing', page)
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// getPopular  GET /movies/popular?page=1
// ─────────────────────────────────────────────────────────────

export const getPopular = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query['page'], 1, 'page')
  const data = await moviesService.getMovieLists('popular', page)
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// getTopRated  GET /movies/top-rated?page=1
// ─────────────────────────────────────────────────────────────

export const getTopRated = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query['page'], 1, 'page')
  const data = await moviesService.getMovieLists('top_rated', page)
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// getUpcoming  GET /movies/upcoming?page=1
// ─────────────────────────────────────────────────────────────

export const getUpcoming = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query['page'], 1, 'page')
  const data = await moviesService.getMovieLists('upcoming', page)
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// getDetail  GET /movies/:id
// ─────────────────────────────────────────────────────────────

export const getDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params['id'], 0, 'id')
  if (id === 0) {
    throw new AppError('Movie ID is required', 400, 'VALIDATION_ERROR')
  }

  const data = await moviesService.getMovieDetail(id)
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// getPersonDetail  GET /persons/:id
// ─────────────────────────────────────────────────────────────

export const getPersonDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params['id'], 0, 'id')
  if (id === 0) {
    throw new AppError('Person ID is required', 400, 'VALIDATION_ERROR')
  }

  const data = await moviesService.getPersonDetail(id)
  if (!data) {
    throw new AppError('Person not found', 404, 'PERSON_NOT_FOUND')
  }

  res.status(200).json(apiResponse.success(data, 'PERSON_DETAIL_FETCHED'))
})

// ─────────────────────────────────────────────────────────────
// getPersonCredits  GET /persons/:id/credits
// ─────────────────────────────────────────────────────────────

export const getPersonCredits = asyncHandler(async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params['id'], 0, 'id')
  if (id === 0) {
    throw new AppError('Person ID is required', 400, 'VALIDATION_ERROR')
  }

  const data = await moviesService.getPersonCredits(id)
  if (!data) {
    throw new AppError('Person not found', 404, 'PERSON_NOT_FOUND')
  }

  res.status(200).json(apiResponse.success(data, 'PERSON_CREDITS_FETCHED'))
})

// ─────────────────────────────────────────────────────────────
// getSimilar  GET /movies/:id/similar
// ─────────────────────────────────────────────────────────────

export const getSimilar = asyncHandler(async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params['id'], 0, 'id')
  if (id === 0) {
    throw new AppError('Movie ID is required', 400, 'VALIDATION_ERROR')
  }

  const data = await moviesService.getSimilar(id)
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// getGenres  GET /genres
// ─────────────────────────────────────────────────────────────

export const getGenres = asyncHandler(async (_req: Request, res: Response) => {
  const data = await moviesService.getGenres()
  res.status(200).json({ success: true, data })
})

// ─────────────────────────────────────────────────────────────
// discover  GET /discover?genre=28&year=2024&rating=7&sort=popularity.desc
// ─────────────────────────────────────────────────────────────

export const discover = asyncHandler(async (req: Request, res: Response) => {
  const { genre, year, rating, sort, page } = req.query as Record<string, string | undefined>

  const data = await moviesService.discover({
    ...(genre !== undefined && { genre }),
    ...(year !== undefined && { year: Number(year) }),
    ...(rating !== undefined && { rating: Number(rating) }),
    ...(sort !== undefined && { sort }),
    page: page !== undefined ? Number(page) : 1,
  })

  res.status(200).json({ success: true, data })
})
