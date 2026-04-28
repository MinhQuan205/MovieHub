import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'
import { searchService } from './search.service'

// ─────────────────────────────────────────────────────────────
// Helper — extract validated string query param
// ─────────────────────────────────────────────────────────────

function requireQueryString(
  value: unknown,
  paramName: string
): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  throw new AppError(`"${paramName}" query param is required`, 400, 'VALIDATION_ERROR')
}

// ─────────────────────────────────────────────────────────────
// GET /search?q=<query>&page=<n>
// ─────────────────────────────────────────────────────────────

/**
 * Full-text movie search.
 * Primary: Elasticsearch fuzzy search.
 * Fallback: TMDB /search/movie (automatic, logged).
 * NOT cached — results must always be fresh (guide §5.2).
 */
export const search = asyncHandler(async (req: Request, res: Response) => {
  // `q` already validated + stripped by Joi middleware; re-assert for type safety
  const q = requireQueryString(req.query['q'], 'q')
  const rawPage = req.query['page']
  const page = rawPage !== undefined ? Math.max(1, Number(rawPage)) : 1

  const result = await searchService.searchMovies(q, page)

  res.status(200).json({
    success: true,
    data: {
      hits:       result.hits,
      total:      result.total,
      page:       result.page,
      pageSize:   result.pageSize,
      totalPages: result.totalPages,
      source:     result.source,
    },
  })
})

// ─────────────────────────────────────────────────────────────
// GET /search/suggestions?q=<query>
// ─────────────────────────────────────────────────────────────

/**
 * Autocomplete suggestions — returns top 5 titles matching the query.
 * Primary: Elasticsearch.
 * Fallback: TMDB /search/movie page 1, sliced to 5.
 * NOT cached — autocomplete must reflect the latest data (guide §5.2).
 */
export const suggestions = asyncHandler(async (req: Request, res: Response) => {
  const q = requireQueryString(req.query['q'], 'q')

  const items = await searchService.getSuggestions(q)

  res.status(200).json({
    success: true,
    data: items,
  })
})
