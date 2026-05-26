import { config } from '../config'
import { isElasticsearchConnected } from '../config/elasticsearch'
import logger from '../utils/logger'
import { elasticsearchService } from './elasticsearch.service'
import { tmdbService } from './tmdb.service'
import type { TMDBMovie, TMDBMovieList } from '@shared/types/movie.types'

const SEARCH_SEED_QUERIES = ['avengers', 'batman', 'spider man', 'iron man']

function uniqueMovies(lists: TMDBMovieList[]): TMDBMovie[] {
  const moviesById = new Map<number, TMDBMovie>()

  for (const list of lists) {
    for (const movie of list.results) {
      moviesById.set(movie.id, movie)
    }
  }

  return Array.from(moviesById.values())
}

async function fetchSeedLists(includeCatalogLists: boolean): Promise<TMDBMovieList[]> {
  const requests: Array<Promise<TMDBMovieList>> = [
    ...SEARCH_SEED_QUERIES.map((query) => tmdbService.searchMovies(query, 1)),
  ]

  if (includeCatalogLists) {
    requests.push(
      tmdbService.getPopular(1),
      tmdbService.getPopular(2),
      tmdbService.getTopRated(1),
      tmdbService.getTrending('day', 1),
      tmdbService.getTrending('week', 1)
    )
  }

  const settled = await Promise.allSettled(requests)

  return settled.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [result.value]
    }

    logger.warn('[SearchIndex] Seed list fetch failed', {
      reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
    })
    return []
  })
}

/**
 * Prepare Elasticsearch for movie search.
 *
 * Fuzzy search only works over documents already indexed in Elasticsearch, so
 * startup creates the movies index and seeds it from TMDB when it is empty.
 */
export async function bootstrapSearchIndex(): Promise<void> {
  if (!isElasticsearchConnected()) {
    logger.warn('[SearchIndex] Elasticsearch is disabled; search will use TMDB fallback')
    return
  }

  await elasticsearchService.ensureIndex()

  const existingCount = await elasticsearchService.countMovies()
  const shouldSeedCatalogLists = existingCount === 0

  if (existingCount > 0) {
    logger.info('[SearchIndex] Existing Elasticsearch movie index detected', {
      count: existingCount,
    })
  }

  if (!config.tmdb.apiKey) {
    logger.warn('[SearchIndex] TMDB_API_KEY is missing; cannot seed Elasticsearch movies index')
    return
  }

  const lists = await fetchSeedLists(shouldSeedCatalogLists)
  const movies = uniqueMovies(lists)

  if (movies.length === 0) {
    logger.warn('[SearchIndex] No TMDB movies available to seed Elasticsearch')
    return
  }

  const result = await elasticsearchService.bulkIndex(movies)

  logger.info('[SearchIndex] Elasticsearch movie index seeded', {
    requested: movies.length,
    indexed: result.indexed,
    failed: result.failed,
  })
}
