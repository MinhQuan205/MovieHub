import express from 'express'
import request from 'supertest'

// ─── Mock config FIRST ────────────────────────────────────────────────────────

jest.mock('../../config', () => ({
  config: {
    nodeEnv: 'test',
    apiPrefix: '/api/v1',
    jwt: {
      accessSecret: 'test-access-secret-1234567890',
      refreshSecret: 'test-refresh-secret-1234567890',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
  },
}))

// ─── Mock Elasticsearch service ───────────────────────────────────────────────

const mockEsSearchMovies = jest.fn()

jest.mock('../../services/elasticsearch.service', () => ({
  elasticsearchService: {
    searchMovies: mockEsSearchMovies,
  },
}))

// ─── Mock isElasticsearchConnected flag ───────────────────────────────────────

const mockIsEsConnected = jest.fn<boolean, []>()

jest.mock('../../config/elasticsearch', () => ({
  isElasticsearchConnected: () => mockIsEsConnected(),
}))

// ─── Mock TMDB service ────────────────────────────────────────────────────────

const mockTmdbSearchMovies = jest.fn()

jest.mock('../../services/tmdb.service', () => ({
  tmdbService: {
    searchMovies: mockTmdbSearchMovies,
  },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import searchRoutes from './search.routes'
import { errorHandler } from '../../middleware/errorHandler'

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeEsHit(overrides: Partial<{ id: number; title: string }> = {}) {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? 'Batman Begins',
    original_title: 'Batman Begins',
    overview: 'A hero is born.',
    poster_path: '/batman.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2005-06-15',
    vote_average: 8.2,
    vote_count: 12000,
    popularity: 55.3,
    genre_ids: [28, 80],
    original_language: 'en',
    adult: false,
    score: 1.5,
  }
}

function makeEsResult(hits: ReturnType<typeof makeEsHit>[] = [makeEsHit()]) {
  return {
    hits,
    total: hits.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }
}

function makeTmdbMovie(overrides: Partial<{ id: number; title: string }> = {}) {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? 'Batman Begins',
    original_title: 'Batman Begins',
    overview: 'A hero is born (TMDB).',
    poster_path: '/batman-tmdb.jpg',
    backdrop_path: '/backdrop-tmdb.jpg',
    release_date: '2005-06-15',
    vote_average: 8.1,
    vote_count: 11000,
    popularity: 54.0,
    genre_ids: [28],
    original_language: 'en',
    adult: false,
  }
}

function makeTmdbResult(movies: ReturnType<typeof makeTmdbMovie>[] = [makeTmdbMovie()]) {
  return {
    results: movies,
    total_results: movies.length,
    total_pages: 1,
    page: 1,
  }
}

// ─── Test App Factory ─────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', searchRoutes)
  app.use(errorHandler)
  return app
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('Search API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── GET /search ────────────────────────────────────────────────────────────

  describe('GET /api/v1/search', () => {
    it('returns 400 when q param is missing', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/v1/search')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when q param is empty', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/v1/search?q=')

      expect(res.status).toBe(400)
    })

    it('returns search results from Elasticsearch when ES is available', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(true)

      const esHit = makeEsHit({ id: 42, title: 'Batman Begins' })
      mockEsSearchMovies.mockResolvedValue(makeEsResult([esHit]))

      const res = await request(app).get('/api/v1/search?q=batman')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.source).toBe('elasticsearch')
      expect(res.body.data.hits).toHaveLength(1)
      expect(res.body.data.hits[0].title).toBe('Batman Begins')

      // TMDB should NOT be called when ES succeeds
      expect(mockTmdbSearchMovies).not.toHaveBeenCalled()
    })

    it('falls back to TMDB when Elasticsearch is not connected', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(false)

      const tmdbMovie = makeTmdbMovie({ id: 99, title: 'Batman Begins TMDB' })
      mockTmdbSearchMovies.mockResolvedValue(makeTmdbResult([tmdbMovie]))

      const res = await request(app).get('/api/v1/search?q=batman')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.source).toBe('tmdb_fallback')
      expect(res.body.data.hits).toHaveLength(1)
      expect(res.body.data.hits[0].title).toBe('Batman Begins TMDB')

      // ES should not be called when not connected
      expect(mockEsSearchMovies).not.toHaveBeenCalled()
    })

    it('falls back to TMDB when Elasticsearch throws an error', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(true)
      mockEsSearchMovies.mockRejectedValue(new Error('ES connection refused'))

      const tmdbMovie = makeTmdbMovie({ id: 77, title: 'Batman Dark Knight' })
      mockTmdbSearchMovies.mockResolvedValue(makeTmdbResult([tmdbMovie]))

      const res = await request(app).get('/api/v1/search?q=batman')

      expect(res.status).toBe(200)
      expect(res.body.data.source).toBe('tmdb_fallback')
      expect(mockTmdbSearchMovies).toHaveBeenCalledTimes(1)
    })

    it('passes page parameter correctly', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(true)
      mockEsSearchMovies.mockResolvedValue(makeEsResult())

      await request(app).get('/api/v1/search?q=batman&page=3')

      expect(mockEsSearchMovies).toHaveBeenCalledWith('batman', {
        page: 3,
        pageSize: 20,
      })
    })

    it('defaults to page 1 when page param is omitted', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(true)
      mockEsSearchMovies.mockResolvedValue(makeEsResult())

      await request(app).get('/api/v1/search?q=batman')

      expect(mockEsSearchMovies).toHaveBeenCalledWith('batman', {
        page: 1,
        pageSize: 20,
      })
    })

    it('returns correct response shape (hits, total, page, pageSize, totalPages, source)', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(true)

      const esResult = {
        hits: [makeEsHit(), makeEsHit({ id: 2, title: 'Batman Forever' })],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }
      mockEsSearchMovies.mockResolvedValue(esResult)

      const res = await request(app).get('/api/v1/search?q=batman')

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        hits: expect.any(Array),
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        source: 'elasticsearch',
      })
    })
  })

  // ── GET /search/suggestions ────────────────────────────────────────────────

  describe('GET /api/v1/search/suggestions', () => {
    it('returns 400 when q param is missing', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/v1/search/suggestions')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns suggestions array from Elasticsearch when available', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(true)

      const hits = [
        makeEsHit({ id: 1, title: 'Batman Begins' }),
        makeEsHit({ id: 2, title: 'Batman Forever' }),
        makeEsHit({ id: 3, title: 'Batman Returns' }),
      ]
      mockEsSearchMovies.mockResolvedValue({
        hits,
        total: 3,
        page: 1,
        pageSize: 5,
        totalPages: 1,
      })

      const res = await request(app).get('/api/v1/search/suggestions?q=bat')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBeLessThanOrEqual(5)

      // Verify suggestion item shape
      expect(res.body.data[0]).toMatchObject({
        id: expect.any(Number),
        title: expect.any(String),
        original_title: expect.any(String),
        release_date: expect.any(String),
        vote_average: expect.any(Number),
      })
    })

    it('returns at most 5 suggestions', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(false)

      // TMDB returns 10 results — we should only get 5 back
      const manyMovies = Array.from({ length: 10 }, (_, i) => makeTmdbMovie({ id: i + 1, title: `Batman ${i + 1}` }))
      mockTmdbSearchMovies.mockResolvedValue(makeTmdbResult(manyMovies))

      const res = await request(app).get('/api/v1/search/suggestions?q=bat')

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBeLessThanOrEqual(5)
    })

    it('falls back to TMDB when ES is not connected for suggestions', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(false)

      const tmdbMovies = [
        makeTmdbMovie({ id: 10, title: 'Batman Begins' }),
        makeTmdbMovie({ id: 11, title: 'Batman Returns' }),
      ]
      mockTmdbSearchMovies.mockResolvedValue(makeTmdbResult(tmdbMovies))

      const res = await request(app).get('/api/v1/search/suggestions?q=bat')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(mockEsSearchMovies).not.toHaveBeenCalled()
    })

    it('falls back to TMDB when ES throws for suggestions', async () => {
      const app = createTestApp()
      mockIsEsConnected.mockReturnValue(true)
      mockEsSearchMovies.mockRejectedValue(new Error('ES timeout'))

      mockTmdbSearchMovies.mockResolvedValue(makeTmdbResult([makeTmdbMovie()]))

      const res = await request(app).get('/api/v1/search/suggestions?q=bat')

      expect(res.status).toBe(200)
      expect(mockTmdbSearchMovies).toHaveBeenCalledTimes(1)
    })
  })
})
