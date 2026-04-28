import Joi from 'joi'

// ─────────────────────────────────────────────────────────────
// Schema 1: Basic list query params (page + time window)
// Used by: getTrending
// ─────────────────────────────────────────────────────────────

export const movieListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  window: Joi.string().valid('day', 'week').default('day'),
})

// ─────────────────────────────────────────────────────────────
// Schema 2: Paginated list query (page only)
// Used by: getNowPlaying, getPopular, getTopRated, getUpcoming
// ─────────────────────────────────────────────────────────────

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
})

// ─────────────────────────────────────────────────────────────
// Schema 3: Movie ID route param
// Used by: getDetail, getSimilar
// ─────────────────────────────────────────────────────────────

export const movieIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
})

// ─────────────────────────────────────────────────────────────
// Schema 4: Discover query params
// Used by: discover
// ─────────────────────────────────────────────────────────────

export const discoverQuerySchema = Joi.object({
  genre: Joi.string().trim().optional(),
  year: Joi.number().integer().min(1888).max(new Date().getFullYear() + 5).optional(),
  rating: Joi.number().min(0).max(10).optional(),
  sort: Joi.string()
    .valid(
      'popularity.desc',
      'popularity.asc',
      'vote_average.desc',
      'vote_average.asc',
      'release_date.desc',
      'release_date.asc',
      'revenue.desc'
    )
    .default('popularity.desc'),
  page: Joi.number().integer().min(1).default(1),
})
