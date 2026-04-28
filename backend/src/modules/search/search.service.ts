import { elasticsearchService } from '../../services/elasticsearch.service'
import { tmdbService } from '../../services/tmdb.service'
import { isElasticsearchConnected } from '../../config/elasticsearch'
import logger from '../../utils/logger'
import type { SearchResult, SearchHit } from '../../services/elasticsearch.service'
import type { TMDBMovie, TMDBMovieList } from '@shared/types/movie.types'

// ─────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────

/** Unified result returned by SearchService — works for both ES and TMDB fallback */
export interface MovieSearchResult {
  hits: SearchHit[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** Indicates the data source actually used */
  source: 'elasticsearch' | 'tmdb_fallback'
}

/** Top-5 autocomplete suggestion */
export interface SuggestionItem {
  id: number
  title: string
  original_title: string
  poster_path: string | null
  release_date: string
  vote_average: number
}

// ─────────────────────────────────────────────────────────────
// Adapter helpers
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const SUGGESTION_SIZE = 5

/**
 * Convert a TMDBMovieList response into the same shape as a SearchResult
 * so the controller always receives one unified type.
 */
function tmdbListToSearchResult(
  tmdbResult: TMDBMovieList
): MovieSearchResult {
  const hits: SearchHit[] = tmdbResult.results.map((m: TMDBMovie) => ({
    id:                m.id,
    title:             m.title,
    original_title:    m.original_title,
    overview:          m.overview,
    poster_path:       m.poster_path,
    backdrop_path:     m.backdrop_path,
    release_date:      m.release_date,
    vote_average:      m.vote_average,
    vote_count:        m.vote_count,
    popularity:        m.popularity,
    genre_ids:         m.genre_ids,
    original_language: m.original_language,
    adult:             m.adult,
    score:             null,          // TMDB has no relevance score
  }))

  return {
    hits,
    total:      tmdbResult.total_results,
    page:       tmdbResult.page,
    pageSize:   PAGE_SIZE,
    totalPages: tmdbResult.total_pages,
    source:     'tmdb_fallback',
  }
}

// ─────────────────────────────────────────────────────────────
// SearchService
// ─────────────────────────────────────────────────────────────

export class SearchService {
  /**
   * Search movies with Elasticsearch (primary).
   * Automatically falls back to TMDB `/search/movie` when ES is unavailable
   * or returns an error — ensuring the API always responds.
   *
   * No results are cached per guide section 5.2.
   */
  async searchMovies(query: string, page = 1): Promise<MovieSearchResult> {
    // ── Primary: Elasticsearch ─────────────────────────────

    if (isElasticsearchConnected()) {
      try {
        const esResult: SearchResult = await elasticsearchService.searchMovies(query, {
          page,
          pageSize: PAGE_SIZE,
        })

        logger.info('Search served by Elasticsearch', {
          query,
          page,
          total: esResult.total,
        })

        return { ...esResult, source: 'elasticsearch' }
      } catch (esErr) {
        // Any ES error triggers the fallback — log clearly so devs notice
        logger.warn(
          '[SearchService] Elasticsearch search failed — falling back to TMDB API',
          {
            query,
            page,
            error: esErr instanceof Error ? esErr.message : String(esErr),
          }
        )
      }
    } else {
      logger.warn(
        '[SearchService] Elasticsearch not connected — using TMDB fallback immediately',
        { query, page }
      )
    }

    // ── Fallback: TMDB /search/movie ───────────────────────

    const tmdbResult = await tmdbService.searchMovies(query, page)

    logger.info('Search served by TMDB fallback', {
      query,
      page,
      total: tmdbResult.total_results,
    })

    return tmdbListToSearchResult(tmdbResult)
  }

  /**
   * Return top-5 autocomplete suggestions for the given query string.
   *
   * Strategy:
   *  1. Prefer Elasticsearch — prefix-friendly `match_phrase_prefix` on `title`
   *     with a `multi_match` fallback across `original_title` too.
   *  2. Fall back to the first page of TMDB `/search/movie` and slice to 5.
   *
   * Results are NOT cached (guide section 5.2).
   */
  async getSuggestions(query: string): Promise<SuggestionItem[]> {
    // ── Primary: Elasticsearch ─────────────────────────────

    if (isElasticsearchConnected()) {
      try {
        // Use a tight pageSize=5 so ES does minimal work
        const esResult: SearchResult = await elasticsearchService.searchMovies(query, {
          page:     1,
          pageSize: SUGGESTION_SIZE,
        })

        const suggestions: SuggestionItem[] = esResult.hits.map((h) => ({
          id:             h.id,
          title:          h.title,
          original_title: h.original_title,
          poster_path:    h.poster_path,
          release_date:   h.release_date,
          vote_average:   h.vote_average,
        }))

        logger.info('Suggestions served by Elasticsearch', {
          query,
          count: suggestions.length,
        })

        return suggestions
      } catch (esErr) {
        logger.warn(
          '[SearchService] Elasticsearch suggestions failed — falling back to TMDB',
          {
            query,
            error: esErr instanceof Error ? esErr.message : String(esErr),
          }
        )
      }
    } else {
      logger.warn(
        '[SearchService] Elasticsearch not connected — using TMDB for suggestions',
        { query }
      )
    }

    // ── Fallback: TMDB search (page 1, slice 5) ────────────

    const tmdbResult = await tmdbService.searchMovies(query, 1)

    const suggestions: SuggestionItem[] = tmdbResult.results
      .slice(0, SUGGESTION_SIZE)
      .map((m: TMDBMovie) => ({
        id:             m.id,
        title:          m.title,
        original_title: m.original_title,
        poster_path:    m.poster_path,
        release_date:   m.release_date,
        vote_average:   m.vote_average,
      }))

    logger.info('Suggestions served by TMDB fallback', {
      query,
      count: suggestions.length,
    })

    return suggestions
  }
}

export const searchService = new SearchService()
