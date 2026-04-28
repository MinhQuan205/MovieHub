/**
 * movies.test.ts
 * Integration tests for the Movies module.
 *
 * Strategy:
 *  - Mock `../../services/tmdb.service` so no real HTTP calls are made.
 *  - Mock `../../config/redis` to control cache hit/miss scenarios in-memory.
 *  - Mount only the movies router on a minimal Express app.
 *  - Assert HTTP status codes, response shape, and cache behaviour.
 */

import express from 'express'
import request from 'supertest'

// ─────────────────────────────────────────────────────────────
// 1. Mock config (must be first — other mocks may import it)
// ─────────────────────────────────────────────────────────────

jest.mock('../../config', () => ({
  config: {
    nodeEnv: 'test',
    apiPrefix: '/api/v1',
    redisUrl: '',
  },
}))

// ─────────────────────────────────────────────────────────────
// 2. In-memory Redis stub — used by cacheMiddleware
// ─────────────────────────────────────────────────────────────

const redisStore = new Map<string, string>()

jest.mock('../../config/redis', () => ({
  isRedisConnected: jest.fn(() => true),
  getRedisClient: jest.fn(() => ({
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, value)
      return 'OK'
    }),
    set: jest.fn(
      async (key: string, value: string, ..._rest: unknown[]) => {
        redisStore.set(key, value)
        return 'OK'
      }
    ),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key)
      return 1
    }),
  })),
}))

// ─────────────────────────────────────────────────────────────
// 3. Mock TMDBService — return deterministic fixtures
// ─────────────────────────────────────────────────────────────

/** Minimal movie fixture */
const MOVIE_FIXTURE = {
  id: 1,
  title: 'Test Movie',
  original_title: 'Test Movie',
  overview: 'A test movie.',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  release_date: '2024-01-01',
  vote_average: 8.0,
  vote_count: 1000,
  popularity: 500,
  genre_ids: [28],
  original_language: 'en',
  adult: false,
  video: false,
}

const MOVIE_LIST_FIXTURE = {
  page: 1,
  results: [MOVIE_FIXTURE],
  total_pages: 10,
  total_results: 200,
}

const GENRE_FIXTURE = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
]

const MOVIE_DETAIL_FIXTURE = {
  ...MOVIE_FIXTURE,
  genres: GENRE_FIXTURE,
  runtime: 120,
  status: 'Released',
  tagline: 'Just a test.',
  budget: 100_000_000,
  revenue: 500_000_000,
  homepage: null,
  imdb_id: 'tt9999999',
  production_companies: [],
  production_countries: [],
  spoken_languages: [],
  credits: { cast: [], crew: [] },
  videos: { results: [] },
  images: { backdrops: [], posters: [] },
  recommendations: { page: 1, results: [], total_pages: 0, total_results: 0 },
  similar: { page: 1, results: [], total_pages: 0, total_results: 0 },
  trailer: null,
  director: null,
}

jest.mock('../../services/tmdb.service', () => ({
  tmdbService: {
    getTrending: jest.fn(async () => MOVIE_LIST_FIXTURE),
    getNowPlaying: jest.fn(async () => MOVIE_LIST_FIXTURE),
    getPopular: jest.fn(async () => MOVIE_LIST_FIXTURE),
    getTopRated: jest.fn(async () => MOVIE_LIST_FIXTURE),
    getUpcoming: jest.fn(async () => MOVIE_LIST_FIXTURE),
    getMovieDetail: jest.fn(async (id: number) => {
      if (id === 9999) {
        const { AppError } = jest.requireActual('../../utils/AppError') as typeof import('../../utils/AppError')
        throw new AppError('Resource not found', 404, 'NOT_FOUND')
      }
      return MOVIE_DETAIL_FIXTURE
    }),
    getMovieSimilar: jest.fn(async () => MOVIE_LIST_FIXTURE),
    getGenres: jest.fn(async () => GENRE_FIXTURE),
    discoverMovies: jest.fn(async () => MOVIE_LIST_FIXTURE),
  },
}))

// ─────────────────────────────────────────────────────────────
// 4. Import modules AFTER mocks are registered
// ─────────────────────────────────────────────────────────────

import moviesRouter from './movies.routes'
import { errorHandler } from '../../middleware/errorHandler'
import { isRedisConnected } from '../../config/redis'
import { tmdbService } from '../../services/tmdb.service'

const mockedIsRedisConnected = isRedisConnected as jest.MockedFunction<typeof isRedisConnected>
const mockedTmdbService = tmdbService as jest.Mocked<typeof tmdbService>

// ─────────────────────────────────────────────────────────────
// 5. Test app factory
// ─────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', moviesRouter)
  app.use(errorHandler)
  return app
}

// ─────────────────────────────────────────────────────────────
// 6. Test suites
// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/movies/trending', () => {
  beforeEach(() => {
    redisStore.clear()
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(true)
  })

  it('returns 200 with correct shape', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/movies/trending')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      page: 1,
      total_pages: expect.any(Number),
      total_results: expect.any(Number),
      results: expect.arrayContaining([
        expect.objectContaining({ id: expect.any(Number), title: expect.any(String) }),
      ]),
    })
  })

  it('accepts window=week query param', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/movies/trending?window=week&page=2')

    expect(res.status).toBe(200)
    expect(mockedTmdbService.getTrending).toHaveBeenCalledWith('week', 2)
  })

  it('defaults window to "day" when not supplied', async () => {
    const app = createTestApp()
    await request(app).get('/api/v1/movies/trending')

    expect(mockedTmdbService.getTrending).toHaveBeenCalledWith('day', 1)
  })

  it('rejects invalid window value with 400', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/movies/trending?window=month')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/movies/:id (detail)', () => {
  beforeEach(() => {
    redisStore.clear()
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(true)
  })

  it('returns 200 with full detail shape for valid id', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/movies/1')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      id: 1,
      title: expect.any(String),
      genres: expect.any(Array),
      credits: expect.objectContaining({ cast: expect.any(Array) }),
      trailer: null,
      director: null,
    })
  })

  it('returns 404 when movie does not exist', async () => {
    const app = createTestApp()
    // id 9999 is set to throw a 404 AppError in the mock above
    const res = await request(app).get('/api/v1/movies/9999')

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 for non-numeric id', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/movies/abc')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/movies/:id/similar', () => {
  beforeEach(() => {
    redisStore.clear()
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(true)
  })

  it('returns 200 with movie list shape', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/movies/1/similar')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.results)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/genres', () => {
  beforeEach(() => {
    redisStore.clear()
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(true)
  })

  it('returns 200 with genre array', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/genres')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }),
    ]))
  })
})

// ─────────────────────────────────────────────────────────────

describe('GET /api/v1/discover', () => {
  beforeEach(() => {
    redisStore.clear()
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(true)
  })

  it('returns 200 with movie list shape', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/discover?genre=28&year=2024&rating=7')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({ page: 1, results: expect.any(Array) })
  })

  it('forwards discover params correctly to tmdbService', async () => {
    const app = createTestApp()
    await request(app).get('/api/v1/discover?genre=28&year=2024&rating=7&sort=vote_average.desc&page=2')

    expect(mockedTmdbService.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        genre: 28,
        year: 2024,
        minRating: 7,
        sortBy: 'vote_average.desc',
        page: 2,
      })
    )
  })

  it('returns 400 for invalid sort value', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/discover?sort=invalid_sort')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────

describe('Cache middleware behaviour', () => {
  beforeEach(() => {
    redisStore.clear()
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(true)
  })

  it('cache MISS → calls tmdbService, then stores result in Redis', async () => {
    const app = createTestApp()

    // First request — no cache yet
    const res = await request(app).get('/api/v1/movies/trending')

    expect(res.status).toBe(200)
    // tmdbService was called once
    expect(mockedTmdbService.getTrending).toHaveBeenCalledTimes(1)
    // Redis now holds a cached entry for this URL
    const cacheKey = 'cache:/api/v1/movies/trending'
    expect(redisStore.has(cacheKey)).toBe(true)
  })

  it('cache HIT → serves from Redis without calling tmdbService', async () => {
    const app = createTestApp()
    const cacheKey = 'cache:/api/v1/movies/popular'

    // Pre-populate cache
    redisStore.set(cacheKey, JSON.stringify({ success: true, data: MOVIE_LIST_FIXTURE }))

    const res = await request(app).get('/api/v1/movies/popular')

    expect(res.status).toBe(200)
    // tmdbService must NOT have been called
    expect(mockedTmdbService.getPopular).not.toHaveBeenCalled()
    // Response data comes straight from the cache
    expect(res.body.data).toMatchObject({ page: 1 })
  })

  it('bypasses cache when Redis is disconnected', async () => {
    mockedIsRedisConnected.mockReturnValue(false)
    const app = createTestApp()

    const res = await request(app).get('/api/v1/movies/trending')

    expect(res.status).toBe(200)
    // tmdbService still called normally
    expect(mockedTmdbService.getTrending).toHaveBeenCalledTimes(1)
    // Nothing stored in the stub store
    expect(redisStore.size).toBe(0)
  })

  it('caches discover results keyed by full URL (different params → different cache entries)', async () => {
    const app = createTestApp()

    await request(app).get('/api/v1/discover?genre=28')
    await request(app).get('/api/v1/discover?genre=12')

    // Two different cache keys should exist
    const keys = Array.from(redisStore.keys()).filter((k) => k.includes('discover'))
    expect(keys.length).toBe(2)
    // tmdbService called for each unique set of params
    expect(mockedTmdbService.discoverMovies).toHaveBeenCalledTimes(2)
  })
})

// ─────────────────────────────────────────────────────────────

describe('Movie list endpoints — pagination', () => {
  beforeEach(() => {
    redisStore.clear()
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(false) // disable cache for simplicity
  })

  const listEndpoints: Array<{ path: string; method: keyof typeof tmdbService }> = [
    { path: '/api/v1/movies/now-playing', method: 'getNowPlaying' },
    { path: '/api/v1/movies/popular', method: 'getPopular' },
    { path: '/api/v1/movies/top-rated', method: 'getTopRated' },
    { path: '/api/v1/movies/upcoming', method: 'getUpcoming' },
  ]

  it.each(listEndpoints)('$path returns 200 with movie list shape', async ({ path }) => {
    const app = createTestApp()
    const res = await request(app).get(path)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      page: expect.any(Number),
      results: expect.any(Array),
    })
  })

  it.each(listEndpoints)('$path passes page param to service', async ({ path, method }) => {
    const app = createTestApp()
    await request(app).get(`${path}?page=3`)

    // The controller calls moviesService.getMovieLists(type, page) which in turn
    // calls tmdbService.<method>(page) — only one argument at the tmdb layer.
    expect(mockedTmdbService[method]).toHaveBeenCalledWith(3)
  })

  it('returns 400 when page is 0 or negative', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/v1/movies/popular?page=0')

    expect(res.status).toBe(400)
  })
})
