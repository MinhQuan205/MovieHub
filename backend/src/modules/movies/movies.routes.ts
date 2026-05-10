import { Router } from 'express'
import { cacheMiddleware } from '../../middleware/cache.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  getTrending,
  getNowPlaying,
  getPopular,
  getTopRated,
  getUpcoming,
  getDetail,
  getPersonCredits,
  getPersonDetail,
  getSimilar,
  getGenres,
  discover,
} from './movies.controller'
import {
  movieListQuerySchema,
  paginationQuerySchema,
  movieIdParamSchema,
  personIdParamSchema,
  discoverQuerySchema,
} from './movies.validation'

// ─────────────────────────────────────────────────────────────
// TTL constants (seconds) — tuned to data volatility
// ─────────────────────────────────────────────────────────────

const TTL = {
  TRENDING: 86_400,      // 24 h  — refreshed once per day is enough for mobile
  NOW_PLAYING: 3_600,    // 1 h
  POPULAR: 3_600,        // 1 h
  TOP_RATED: 21_600,     // 6 h   — very stable data
  UPCOMING: 21_600,      // 6 h
  MOVIE_DETAIL: 86_400,  // 24 h  — rarely changes
  PERSON_DETAIL: 86_400, // 24 h  — rarely changes
  SIMILAR: 86_400,       // 24 h
  GENRES: 604_800,       // 7 d   — static list
  DISCOVER: 3_600,       // 1 h   — parameterised, key = full URL
} as const

// ─────────────────────────────────────────────────────────────
// Router — all routes are PUBLIC (no authMiddleware)
// This router is designed to be mounted at multiple prefixes:
//   app.use('/api/movies',   moviesRouter)
//   app.use('/api/genres',   moviesRouter)
//   app.use('/api/discover', moviesRouter)
// ─────────────────────────────────────────────────────────────

const router = Router()

// ── Movie lists ────────────────────────────────────────────────

/**
 * GET /api/movies/trending?window=day|week&page=1
 * Returns trending movies for the given time window.
 */
router.get(
  '/movies/trending',
  validate(movieListQuerySchema, 'query'),
  cacheMiddleware(TTL.TRENDING),
  getTrending
)

/**
 * GET /api/movies/now-playing?page=1
 */
router.get(
  '/movies/now-playing',
  validate(paginationQuerySchema, 'query'),
  cacheMiddleware(TTL.NOW_PLAYING),
  getNowPlaying
)

/**
 * GET /api/movies/popular?page=1
 */
router.get(
  '/movies/popular',
  validate(paginationQuerySchema, 'query'),
  cacheMiddleware(TTL.POPULAR),
  getPopular
)

/**
 * GET /api/movies/top-rated?page=1
 */
router.get(
  '/movies/top-rated',
  validate(paginationQuerySchema, 'query'),
  cacheMiddleware(TTL.TOP_RATED),
  getTopRated
)

/**
 * GET /api/movies/upcoming?page=1
 */
router.get(
  '/movies/upcoming',
  validate(paginationQuerySchema, 'query'),
  cacheMiddleware(TTL.UPCOMING),
  getUpcoming
)

// ── Movie detail ───────────────────────────────────────────────

/**
 * GET /api/movies/:id
 * Full detail: credits, videos, similar, recommendations, trailer, director.
 */
router.get(
  '/movies/:id',
  validate(movieIdParamSchema, 'params'),
  cacheMiddleware(TTL.MOVIE_DETAIL),
  getDetail
)

/**
 * GET /api/persons/:id
 */
router.get(
  '/persons/:id',
  validate(personIdParamSchema, 'params'),
  cacheMiddleware(TTL.PERSON_DETAIL),
  getPersonDetail
)

/**
 * GET /api/persons/:id/credits
 */
router.get(
  '/persons/:id/credits',
  validate(personIdParamSchema, 'params'),
  cacheMiddleware(TTL.PERSON_DETAIL),
  getPersonCredits
)

/**
 * GET /api/movies/:id/similar
 */
router.get(
  '/movies/:id/similar',
  validate(movieIdParamSchema, 'params'),
  cacheMiddleware(TTL.SIMILAR),
  getSimilar
)

// ── Genres ─────────────────────────────────────────────────────

/**
 * GET /api/genres
 * Full genre list — mounted separately at /api/genres
 */
router.get(
  '/genres',
  cacheMiddleware(TTL.GENRES),
  getGenres
)

// ── Discover ───────────────────────────────────────────────────

/**
 * GET /api/discover?genre=28&year=2024&rating=7&sort=popularity.desc&page=1
 * Discover movies with optional filters.
 * Cache key = full originalUrl (includes all query params).
 */
router.get(
  '/discover',
  validate(discoverQuerySchema, 'query'),
  cacheMiddleware(TTL.DISCOVER),
  discover
)

export default router
