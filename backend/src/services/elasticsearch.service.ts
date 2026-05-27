import { errors as EsErrors, type estypes } from '@elastic/elasticsearch'
import { getElasticsearchClient, isElasticsearchConnected } from '../config/elasticsearch'
import { AppError } from '../utils/AppError'
import logger from '../utils/logger'
import type { TMDBMovie } from '@shared/types/movie.types'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MOVIES_INDEX = 'movies'

// ─────────────────────────────────────────────────────────────
// Service-local types
// ─────────────────────────────────────────────────────────────

/** Optional filters applied on top of the full-text query */
export interface SearchFilters {
  /** One or more TMDB genre IDs — any match is included */
  genreIds?: number[]
  /** Minimum vote_average (inclusive) */
  minRating?: number
  /** Maximum vote_average (inclusive) */
  maxRating?: number
  /** Page number, 1-based */
  page?: number
  /** Results per page */
  pageSize?: number
}

/** A single hit returned by searchMovies */
export interface SearchHit {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  popularity: number
  genre_ids: number[]
  original_language: string
  adult: boolean
  /** Elasticsearch relevance score */
  score: number | null
}

/** Paginated search result envelope */
export interface SearchResult {
  hits: SearchHit[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Shape of a document stored in Elasticsearch */
interface MovieDocument {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  popularity: number
  genre_ids: number[]
  original_language: string
  adult: boolean
}

// ─────────────────────────────────────────────────────────────
// Index mapping (declared once, reused by ensureIndex)
// ─────────────────────────────────────────────────────────────

const MOVIES_MAPPING: Record<string, estypes.MappingProperty> = {
  id:                { type: 'integer' },
  title:             { type: 'text',    analyzer: 'standard' },
  original_title:    { type: 'text',    analyzer: 'standard' },
  overview:          { type: 'text',    analyzer: 'standard' },
  genre_ids:         { type: 'integer' },
  release_date:      { type: 'date',    format: 'yyyy-MM-dd||yyyy||epoch_millis' },
  vote_average:      { type: 'float' },
  vote_count:        { type: 'integer' },
  popularity:        { type: 'float' },
  poster_path:       { type: 'keyword', index: false },
  backdrop_path:     { type: 'keyword', index: false },
  original_language: { type: 'keyword' },
  adult:             { type: 'boolean' },
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Convert a TMDBMovie to the flat document shape stored in ES */
function toDocument(movie: TMDBMovie): MovieDocument {
  return {
    id:                movie.id,
    title:             movie.title,
    original_title:    movie.original_title,
    overview:          movie.overview,
    poster_path:       movie.poster_path,
    backdrop_path:     movie.backdrop_path,
    release_date:      movie.release_date || null as any,
    vote_average:      movie.vote_average,
    vote_count:        movie.vote_count,
    popularity:        movie.popularity,
    genre_ids:         movie.genre_ids,
    original_language: movie.original_language,
    adult:             movie.adult,
  }
}

/** Map a raw ES hit back to a SearchHit */
function toSearchHit(
  hit: { _source?: MovieDocument; _score?: number | null }
): SearchHit {
  const src = hit._source as MovieDocument
  return {
    id:                src.id,
    title:             src.title,
    original_title:    src.original_title,
    overview:          src.overview,
    poster_path:       src.poster_path,
    backdrop_path:     src.backdrop_path,
    release_date:      src.release_date,
    vote_average:      src.vote_average,
    vote_count:        src.vote_count,
    popularity:        src.popularity,
    genre_ids:         src.genre_ids,
    original_language: src.original_language,
    adult:             src.adult,
    score:             hit._score ?? null,
  }
}

/** Translate any ES error into an AppError with a clear message */
function handleEsError(err: unknown, context: string): never {
  if (err instanceof EsErrors.ResponseError) {
    const status = err.statusCode ?? 500
    const message = (err.meta.body as { error?: { reason?: string } })?.error?.reason
      ?? err.message
    logger.error(`Elasticsearch ${context} failed`, { status, message })
    throw new AppError(`Elasticsearch ${context} failed: ${message}`, status, 'ES_ERROR')
  }

  if (err instanceof EsErrors.ConnectionError) {
    logger.error(`Elasticsearch ${context} — connection error`, { err: err.message })
    throw new AppError('Elasticsearch is unreachable', 503, 'ES_UNAVAILABLE')
  }

  logger.error(`Elasticsearch ${context} — unexpected error`, { err })
  throw new AppError(`Elasticsearch ${context} failed`, 500, 'ES_ERROR')
}

// ─────────────────────────────────────────────────────────────
// ElasticsearchService
// ─────────────────────────────────────────────────────────────

export class ElasticsearchService {
  // ── Index lifecycle ────────────────────────────────────────

  /**
   * Ensures the `movies` index exists with the correct mapping.
   * Idempotent — safe to call on every server startup.
   * Skips silently when ES is disabled (no URL configured).
   */
  async ensureIndex(): Promise<void> {
    if (!isElasticsearchConnected()) {
      logger.warn('ElasticsearchService.ensureIndex skipped — ES not connected')
      return
    }

    const client = getElasticsearchClient()

    try {
      const exists = await client.indices.exists({ index: MOVIES_INDEX })

      if (exists) {
        logger.info(`Elasticsearch index "${MOVIES_INDEX}" already exists`)
        return
      }

      await client.indices.create({
        index: MOVIES_INDEX,
        mappings: { properties: MOVIES_MAPPING },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          // Refresh every second — good balance for near-real-time search
          refresh_interval: '1s',
        },
      })

      logger.info(`Elasticsearch index "${MOVIES_INDEX}" created with mapping`)
    } catch (err) {
      handleEsError(err, `ensureIndex("${MOVIES_INDEX}")`)
    }
  }

  // ── Single document operations ─────────────────────────────

  /**
   * Upsert a single movie document.
   * Uses `index` (not `create`) so calling it twice is safe.
   */
  async indexMovie(movie: TMDBMovie): Promise<void> {
    if (!isElasticsearchConnected()) {
      logger.warn('ElasticsearchService.indexMovie skipped — ES not connected', { id: movie.id })
      return
    }

    const client = getElasticsearchClient()

    try {
      await client.index({
        index: MOVIES_INDEX,
        id: String(movie.id),
        document: toDocument(movie),
      })

      logger.info('Movie indexed in Elasticsearch', { id: movie.id, title: movie.title })
    } catch (err) {
      handleEsError(err, `indexMovie(${movie.id})`)
    }
  }

  /**
   * Delete a movie document by its TMDB ID.
   * Silently ignores 404 — deleting a non-existent doc is not an error.
   */
  async deleteMovie(id: number): Promise<void> {
    if (!isElasticsearchConnected()) {
      logger.warn('ElasticsearchService.deleteMovie skipped — ES not connected', { id })
      return
    }

    const client = getElasticsearchClient()

    try {
      await client.delete({ index: MOVIES_INDEX, id: String(id) })
      logger.info('Movie deleted from Elasticsearch', { id })
    } catch (err) {
      // 404 → doc was never indexed, treat as success
      if (err instanceof EsErrors.ResponseError && err.statusCode === 404) {
        logger.debug('deleteMovie: document not found in ES (no-op)', { id })
        return
      }
      handleEsError(err, `deleteMovie(${id})`)
    }
  }

  // ── Bulk operations ────────────────────────────────────────

  /**
   * Bulk-upsert an array of movies using the helpers.bulk utility.
   * Returns stats about how many docs succeeded / failed.
   *
   * @param movies - Array of TMDBMovie objects to index
   * @returns `{ indexed, failed }` counts
   */
  async bulkIndex(movies: TMDBMovie[]): Promise<{ indexed: number; failed: number }> {
    if (movies.length === 0) {
      return { indexed: 0, failed: 0 }
    }

    if (!isElasticsearchConnected()) {
      logger.warn('ElasticsearchService.bulkIndex skipped — ES not connected', {
        count: movies.length,
      })
      return { indexed: 0, failed: movies.length }
    }

    const client = getElasticsearchClient()

    // Build the flat datasource array for helpers.bulk
    // We only pass the document body. Metadata like _id and _index goes to the action payload.
    const datasource = movies.map(toDocument)

    let indexed = 0
    let failed = 0

    try {
      const result = await client.helpers.bulk<(typeof datasource)[number]>({
        datasource,
        onDocument(doc) {
          // Tell the helper to perform an upsert (index) operation with specific _id
          return { index: { _index: MOVIES_INDEX, _id: String(doc.id) } }
        },
        onDrop(record) {
          failed++
          logger.warn('Bulk index: document dropped', {
            id: record.document?.id,
            error: record.error,
          })
        },
      })

      indexed = result.successful
      failed += result.failed

      logger.info('Bulk index completed', {
        total: movies.length,
        indexed,
        failed,
        duration: `${result.time}ms`,
      })
    } catch (err) {
      handleEsError(err, 'bulkIndex')
    }

    return { indexed, failed }
  }

  // ── Search ─────────────────────────────────────────────────

  /**
   * Count indexed movie documents.
   * Used during startup to decide whether the search index needs seeding.
   */
  async countMovies(): Promise<number> {
    if (!isElasticsearchConnected()) {
      logger.warn('ElasticsearchService.countMovies skipped - ES not connected')
      return 0
    }

    const client = getElasticsearchClient()

    try {
      const response = await client.count({ index: MOVIES_INDEX })
      return response.count
    } catch (err) {
      if (err instanceof EsErrors.ResponseError && err.statusCode === 404) {
        return 0
      }
      handleEsError(err, `countMovies("${MOVIES_INDEX}")`)
    }
  }

  /**
   * Full-text fuzzy search across title (^3), original_title (^2), overview (^1).
   * Optionally filter by genre IDs and vote_average range.
   *
   * @param query   - The user's search string
   * @param filters - Optional genre/rating/pagination filters
   * @returns Paginated SearchResult
   */
  async searchMovies(query: string, filters: SearchFilters = {}): Promise<SearchResult> {
    if (!isElasticsearchConnected()) {
      logger.warn('ElasticsearchService.searchMovies called but ES not connected')
      throw new AppError('Search service is currently unavailable', 503, 'ES_UNAVAILABLE')
    }

    const client = getElasticsearchClient()

    const page     = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20))
    const from     = (page - 1) * pageSize

    // ── Build the filter array ─────────────────────────────

    const filterClauses: estypes.QueryDslQueryContainer[] = []

    if (filters.genreIds && filters.genreIds.length > 0) {
      filterClauses.push({ terms: { genre_ids: filters.genreIds } })
    }

    if (filters.minRating !== undefined || filters.maxRating !== undefined) {
      filterClauses.push({
        range: {
          vote_average: {
            ...(filters.minRating !== undefined && { gte: filters.minRating }),
            ...(filters.maxRating !== undefined && { lte: filters.maxRating }),
          },
        },
      })
    }

    // ── Build the full DSL query ───────────────────────────

    const esQuery: estypes.QueryDslQueryContainer =
      filterClauses.length > 0
        ? {
            bool: {
              must: [
                {
                  multi_match: {
                    query,
                    fields: ['title^3', 'original_title^2', 'overview^1'],
                    fuzziness: 'AUTO',
                    operator: 'or',
                    type: 'best_fields',
                  },
                },
              ],
              filter: filterClauses,
            },
          }
        : {
            multi_match: {
              query,
              fields: ['title^3', 'original_title^2', 'overview^1'],
              fuzziness: 'AUTO',
              operator: 'or',
              type: 'best_fields',
            },
          }

    // ── Execute ────────────────────────────────────────────

    try {
      const response = await client.search<MovieDocument>({
        index: MOVIES_INDEX,
        from,
        size: pageSize,
        query: esQuery,
        // Return _score for relevance-based ranking
        track_scores: true,
        // Don't return all source fields we don't need for the list view
        _source: {
          excludes: [],
        },
      })

      const rawHits = response.hits.hits

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : (response.hits.total?.value ?? 0)

      const hits = rawHits
        .filter((h): h is typeof h & { _source: MovieDocument } => h._source !== undefined)
        .map((h) =>
          toSearchHit({ _source: h._source, _score: h._score ?? null })
        )

      logger.info('Elasticsearch search completed', {
        query,
        total,
        returned: hits.length,
        page,
        pageSize,
        filters,
      })

      return {
        hits,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    } catch (err) {
      handleEsError(err, `searchMovies("${query}")`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────

export const elasticsearchService = new ElasticsearchService()
