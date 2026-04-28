import { Router } from 'express'
import { validate } from '../../middleware/validate.middleware'
import { search, suggestions } from './search.controller'
import { searchQuerySchema, suggestionQuerySchema } from './search.validation'

// ─────────────────────────────────────────────────────────────
// Search router — all routes are PUBLIC
// No cacheMiddleware — search results must never be cached
// per guide section 5.2.
//
// Mount in app.ts:
//   app.use(config.apiPrefix, searchRouter)
//
// Resulting endpoints:
//   GET /api/v1/search?q=&page=
//   GET /api/v1/search/suggestions?q=
// ─────────────────────────────────────────────────────────────

const router = Router()

/**
 * GET /search?q=<query>&page=<n>
 *
 * Full-text fuzzy movie search.
 * Validates `q` (required, non-empty) and `page` (optional, default 1).
 * Primary: Elasticsearch | Fallback: TMDB /search/movie
 */
router.get(
  '/search',
  validate(searchQuerySchema, 'query'),
  search
)

/**
 * GET /search/suggestions?q=<query>
 *
 * Autocomplete — returns top 5 title suggestions.
 * Validates `q` (required, non-empty).
 * Primary: Elasticsearch | Fallback: TMDB /search/movie (sliced to 5)
 */
router.get(
  '/search/suggestions',
  validate(suggestionQuerySchema, 'query'),
  suggestions
)

export default router
