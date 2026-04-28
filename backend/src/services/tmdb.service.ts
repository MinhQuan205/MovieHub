import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { getRedisClient, isRedisConnected } from '../config/redis'
import { config } from '../config'
import logger from '../utils/logger'
import { AppError } from '../utils/AppError'
import type {
  TMDBMovie,
  TMDBMovieDetail,
  TMDBMovieList,
  TMDBPerson,
  TMDBPersonCredits,
  TMDBGenre,
  TMDBConfiguration,
  TMDBVideo,
  TMDBCrew,
  DiscoverMovieParams,
} from '@shared/types/movie.types'

// ─────────────────────────────────────────────────────────────
// Module augmentation: allow _retry flag on Axios request config
// ─────────────────────────────────────────────────────────────

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean
  }
}

// ─────────────────────────────────────────────────────────────
// TTL Constants (seconds)
// ─────────────────────────────────────────────────────────────

const TTL = {
  TRENDING: 900,        // 15 min — updates frequently
  NOW_PLAYING: 1800,    // 30 min — daily rotation
  POPULAR: 1800,        // 30 min
  TOP_RATED: 3600,      // 1 hour — more stable
  UPCOMING: 3600,       // 1 hour
  MOVIE_DETAIL: 86400,  // 24 hours — rarely changes
  PERSON: 86400,        // 24 hours
  GENRES: 604800,       // 7 days — static
  CONFIG: 604800,       // 7 days — static
} as const

// ─────────────────────────────────────────────────────────────
// Cache Key builders
// ─────────────────────────────────────────────────────────────

const CacheKeys = {
  trending: (window: string, page: number) =>
    `tmdb:trending:${window}:${page}`,
  nowPlaying: (page: number, lang: string) =>
    `tmdb:now_playing:${page}:${lang}`,
  popular: (page: number, lang: string) =>
    `tmdb:popular:${page}:${lang}`,
  topRated: (page: number, lang: string) =>
    `tmdb:top_rated:${page}:${lang}`,
  upcoming: (page: number, lang: string) =>
    `tmdb:upcoming:${page}:${lang}`,
  movieDetail: (id: number, lang: string) =>
    `tmdb:movie:${id}:detail:${lang}`,
  movieSimilar: (id: number, lang: string) =>
    `tmdb:movie:${id}:similar:${lang}`,
  movieProviders: (id: number) =>
    `tmdb:movie:${id}:providers`,
  personDetail: (id: number, lang: string) =>
    `tmdb:person:${id}:detail:${lang}`,
  personCredits: (id: number, lang: string) =>
    `tmdb:person:${id}:credits:${lang}`,
  genres: () => 'tmdb:genres',
  configuration: () => 'tmdb:configuration',
}

// ─────────────────────────────────────────────────────────────
// Axios Instance
// ─────────────────────────────────────────────────────────────

const tmdbClient: AxiosInstance = axios.create({
  baseURL: config.tmdb.baseUrl,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.tmdb.apiKey}`,
  },
})

// 429 rate-limit retry interceptor — retry once after waiting
tmdbClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error)
    }

    const cfg = error.config as InternalAxiosRequestConfig

    if (error.response?.status === 429 && !cfg._retry) {
      cfg._retry = true

      const retryAfterHeader = error.response.headers['retry-after']
      const retryAfterSeconds =
        typeof retryAfterHeader === 'string' && retryAfterHeader.length > 0
          ? Number(retryAfterHeader) || 1
          : 1

      logger.warn(`TMDB rate limited (429). Retrying after ${retryAfterSeconds}s`)

      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryAfterSeconds * 1000)
      })

      return tmdbClient.request(cfg)
    }

    return Promise.reject(error)
  }
)

// ─────────────────────────────────────────────────────────────
// Error Handler
// ─────────────────────────────────────────────────────────────

function handleTMDBError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const message = err.response?.statusText ?? err.message

    if (status === 401) {
      logger.error('TMDB authentication failed', { status })
      throw new AppError('TMDB authentication failed', 500, 'TMDB_AUTH_ERROR')
    }

    if (status === 404) {
      logger.error('Resource not found on TMDB', { status })
      throw new AppError('Resource not found', 404, 'NOT_FOUND')
    }

    if (status === 429) {
      logger.error('TMDB rate limit exceeded', { status })
      throw new AppError('TMDB rate limit exceeded', 429, 'RATE_LIMIT')
    }

    if (status !== undefined && status >= 500) {
      logger.error('TMDB server unavailable', { status, message })
      throw new AppError('TMDB service unavailable', 502, 'TMDB_UNAVAILABLE')
    }

    logger.error('Unexpected TMDB error', { status, message })
    throw new AppError(`TMDB error: ${message}`, 500, 'TMDB_ERROR')
  }

  logger.error('Unknown TMDB error', { err })
  throw new AppError('Unknown TMDB error', 500, 'TMDB_ERROR')
}

// ─────────────────────────────────────────────────────────────
// Cache Helper with Thundering Herd Protection
// ─────────────────────────────────────────────────────────────

async function getWithCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Try reading from cache
  if (isRedisConnected()) {
    try {
      const cached = await getRedisClient().get(key)
      if (cached) {
        return JSON.parse(cached) as T
      }
    } catch (err) {
      logger.warn('Redis cache read failed, falling through to TMDB', { key, err })
    }
  }

  // 2. Thundering Herd protection via Redis lock
  const lockKey = `lock:${key}`
  let lockAcquired = false

  if (isRedisConnected()) {
    try {
      const lockResult = await getRedisClient().set(lockKey, '1', 'EX', 5, 'NX')
      lockAcquired = lockResult === 'OK'
    } catch (err) {
      logger.warn('Redis lock acquisition failed', { lockKey, err })
    }
  }

  if (!lockAcquired && isRedisConnected()) {
    // Another request is fetching — wait 200ms then check cache again
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200)
    })

    try {
      const cached = await getRedisClient().get(key)
      if (cached) {
        return JSON.parse(cached) as T
      }
    } catch (err) {
      logger.warn('Redis cache re-read failed after lock wait', { key, err })
    }

    // Graceful fallback: call fetcher directly (no lock)
  }

  // 3. Call the fetcher
  let data: T

  try {
    data = await fetcher()
  } catch (err) {
    // Release lock on fetch failure
    if (lockAcquired && isRedisConnected()) {
      try {
        await getRedisClient().del(lockKey)
      } catch (delErr) {
        logger.warn('Redis lock release failed after fetch error', { lockKey, delErr })
      }
    }
    handleTMDBError(err)
  }

  // 4. Write to cache
  if (isRedisConnected()) {
    try {
      await getRedisClient().setex(key, ttl, JSON.stringify(data))
    } catch (err) {
      logger.warn('Redis cache write failed', { key, err })
    } finally {
      if (lockAcquired) {
        try {
          await getRedisClient().del(lockKey)
        } catch (err) {
          logger.warn('Redis lock release failed', { lockKey, err })
        }
      }
    }
  }

  return data
}

// ─────────────────────────────────────────────────────────────
// Home Screen Data type
// ─────────────────────────────────────────────────────────────

interface HomeScreenData {
  trending: TMDBMovieList | null
  nowPlaying: TMDBMovieList | null
  popular: TMDBMovieList | null
  topRated: TMDBMovieList | null
  upcoming: TMDBMovieList | null
}

// ─────────────────────────────────────────────────────────────
// Search Multi result type
// ─────────────────────────────────────────────────────────────

interface SearchMultiResult {
  results: Array<TMDBMovie | TMDBPerson>
  total_results: number
  page: number
}

// ─────────────────────────────────────────────────────────────
// TMDBService Class
// ─────────────────────────────────────────────────────────────

export class TMDBService {
  async getHomeScreenData(lang = 'vi-VN'): Promise<HomeScreenData> {
    const results = await Promise.allSettled([
      this.getTrending('day', 1),
      this.getNowPlaying(1, lang),
      this.getPopular(1, lang),
      this.getTopRated(1, lang),
      this.getUpcoming(1, lang),
    ])

    const extract = <T>(result: PromiseSettledResult<T>): T | null => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      logger.warn('Home screen partial failure', { reason: result.reason })
      return null
    }

    return {
      trending: extract(results[0]!),
      nowPlaying: extract(results[1]!),
      popular: extract(results[2]!),
      topRated: extract(results[3]!),
      upcoming: extract(results[4]!),
    }
  }

  async getTrending(timeWindow: 'day' | 'week' = 'day', page = 1): Promise<TMDBMovieList> {
    const key = CacheKeys.trending(timeWindow, page)

    return getWithCache<TMDBMovieList>(key, TTL.TRENDING, async () => {
      const response = await tmdbClient.get<TMDBMovieList>(`/trending/movie/${timeWindow}`, {
        params: { language: 'vi-VN', page },
      })
      return response.data
    })
  }

  async getNowPlaying(page = 1, lang = 'vi-VN'): Promise<TMDBMovieList> {
    const key = CacheKeys.nowPlaying(page, lang)

    return getWithCache<TMDBMovieList>(key, TTL.NOW_PLAYING, async () => {
      const response = await tmdbClient.get<TMDBMovieList>('/movie/now_playing', {
        params: { language: lang, page, region: 'VN' },
      })
      return response.data
    })
  }

  async getPopular(page = 1, lang = 'vi-VN'): Promise<TMDBMovieList> {
    const key = CacheKeys.popular(page, lang)

    return getWithCache<TMDBMovieList>(key, TTL.POPULAR, async () => {
      const response = await tmdbClient.get<TMDBMovieList>('/movie/popular', {
        params: { language: lang, page },
      })
      return response.data
    })
  }

  async getTopRated(page = 1, lang = 'vi-VN'): Promise<TMDBMovieList> {
    const key = CacheKeys.topRated(page, lang)

    return getWithCache<TMDBMovieList>(key, TTL.TOP_RATED, async () => {
      const response = await tmdbClient.get<TMDBMovieList>('/movie/top_rated', {
        params: { language: lang, page },
      })
      return response.data
    })
  }

  async getUpcoming(page = 1, lang = 'vi-VN'): Promise<TMDBMovieList> {
    const key = CacheKeys.upcoming(page, lang)

    return getWithCache<TMDBMovieList>(key, TTL.UPCOMING, async () => {
      const response = await tmdbClient.get<TMDBMovieList>('/movie/upcoming', {
        params: { language: lang, page, region: 'VN' },
      })
      return response.data
    })
  }

  async getMovieDetail(id: number, lang = 'vi-VN'): Promise<TMDBMovieDetail> {
    const key = CacheKeys.movieDetail(id, lang)

    return getWithCache<TMDBMovieDetail>(key, TTL.MOVIE_DETAIL, async () => {
      const response = await tmdbClient.get<TMDBMovieDetail>(`/movie/${id}`, {
        params: {
          language: lang,
          append_to_response: 'credits,videos,images,recommendations,similar',
        },
      })

      const data = response.data

      // post-processed for mobile consumption
      const youtubeTrailer = data.videos?.results?.find(
        (v: TMDBVideo) => v.type === 'Trailer' && v.site === 'YouTube'
      )
      data.trailer = youtubeTrailer ?? null

      const directorEntry = data.credits?.crew?.find(
        (c: TMDBCrew) => c.job === 'Director'
      )
      data.director = directorEntry ?? null

      if (data.credits?.cast) {
        data.credits.cast = data.credits.cast.slice(0, 15)
      }

      return data
    })
  }

  async getMovieSimilar(id: number, lang = 'vi-VN'): Promise<TMDBMovieList> {
    const key = CacheKeys.movieSimilar(id, lang)

    return getWithCache<TMDBMovieList>(key, TTL.MOVIE_DETAIL, async () => {
      const response = await tmdbClient.get<TMDBMovieList>(`/movie/${id}/similar`, {
        params: { language: lang, page: 1 },
      })
      return response.data
    })
  }

  async searchMovies(query: string, page = 1, lang = 'vi-VN'): Promise<TMDBMovieList> {
    // No caching — search queries are unique per user input
    try {
      const response = await tmdbClient.get<TMDBMovieList>('/search/movie', {
        params: { query, language: lang, page, include_adult: false },
      })
      return response.data
    } catch (err) {
      handleTMDBError(err)
    }
  }

  async searchMulti(query: string, page = 1, lang = 'vi-VN'): Promise<SearchMultiResult> {
    // No caching — search queries are unique per user input
    try {
      const response = await tmdbClient.get<{
        results: Array<TMDBMovie | TMDBPerson>
        total_results: number
        page: number
      }>('/search/multi', {
        params: { query, language: lang, page, include_adult: false },
      })

      const data = response.data

      // Filter out TV shows — keep only movie and person
      data.results = data.results.filter((item) => {
        const mediaType = (item as TMDBMovie).media_type
        return mediaType === 'movie' || mediaType === 'person'
      })

      return data
    } catch (err) {
      handleTMDBError(err)
    }
  }

  async discoverMovies(params: DiscoverMovieParams): Promise<TMDBMovieList> {
    // Sort params keys alphabetically to prevent key collision
    const sortedEntries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
    const sortedParams: Record<string, string | number | undefined> = {}
    for (const [k, v] of sortedEntries) {
      sortedParams[k] = v as string | number | undefined
    }
    const key = `tmdb:discover:${JSON.stringify(sortedParams)}`

    return getWithCache<TMDBMovieList>(key, TTL.TOP_RATED, async () => {
      const response = await tmdbClient.get<TMDBMovieList>('/discover/movie', {
        params: {
          with_genres: params.genre,
          primary_release_year: params.year,
          'vote_average.gte': params.minRating,
          sort_by: params.sortBy ?? 'popularity.desc',
          language: params.lang ?? 'vi-VN',
          page: params.page ?? 1,
        },
      })
      return response.data
    })
  }

  async getPersonDetail(id: number, lang = 'vi-VN'): Promise<TMDBPerson> {
    const key = CacheKeys.personDetail(id, lang)

    return getWithCache<TMDBPerson>(key, TTL.PERSON, async () => {
      const response = await tmdbClient.get<TMDBPerson>(`/person/${id}`, {
        params: { language: lang },
      })
      return response.data
    })
  }

  async getPersonCredits(id: number, lang = 'vi-VN'): Promise<TMDBPersonCredits> {
    const key = CacheKeys.personCredits(id, lang)

    return getWithCache<TMDBPersonCredits>(key, TTL.PERSON, async () => {
      const response = await tmdbClient.get<TMDBPersonCredits>(`/person/${id}/movie_credits`, {
        params: { language: lang },
      })
      return response.data
    })
  }

  async getGenres(lang = 'vi-VN'): Promise<TMDBGenre[]> {
    const key = CacheKeys.genres()

    return getWithCache<TMDBGenre[]>(key, TTL.GENRES, async () => {
      const response = await tmdbClient.get<{ genres: TMDBGenre[] }>('/genre/movie/list', {
        params: { language: lang },
      })
      return response.data.genres
    })
  }

  async getConfiguration(): Promise<TMDBConfiguration> {
    const key = CacheKeys.configuration()

    return getWithCache<TMDBConfiguration>(key, TTL.CONFIG, async () => {
      const response = await tmdbClient.get<TMDBConfiguration>('/configuration')
      return response.data
    })
  }
}

export const tmdbService = new TMDBService()
