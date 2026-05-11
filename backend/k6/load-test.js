/**
 * MovieHub Backend — k6 Load Test
 * =================================
 * Tuần 5, Phase 5: Performance Testing
 *
 * Scenarios:
 *   1. rampUp      — ramp 10 → 100 VUs over 2 min, sustained 3 min
 *   2. publicOnly  — public endpoints only (no auth), lighter load
 *   3. protectedSoak — protected endpoints with JWT tokens, moderate load
 *
 * Thresholds:
 *   - http_req_duration p95 < 500ms
 *   - http_req_failed   < 1%
 *
 * Usage:
 *   k6 run k6/load-test.js
 *   k6 run --env BASE_URL=http://localhost:4000 k6/load-test.js
 *   k6 run --env JWT_TOKEN=<token> k6/load-test.js
 *
 * See k6/README.md for full setup instructions.
 */

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'
import { SharedArray } from 'k6/data'

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000'
const API     = `${BASE_URL}/api/v1`

// Optional JWT token for protected endpoints.
// Generate one via: POST /api/v1/auth/login
// Then pass: k6 run --env JWT_TOKEN=<your_token> k6/load-test.js
const JWT_TOKEN = __ENV.JWT_TOKEN || ''

// ─────────────────────────────────────────────────────────────
// Custom Metrics
// ─────────────────────────────────────────────────────────────

const errorRate        = new Rate('custom_error_rate')
const trendingDuration = new Trend('duration_trending',   true)
const detailDuration   = new Trend('duration_movie_detail', true)
const searchDuration   = new Trend('duration_search',     true)
const watchlistDuration= new Trend('duration_watchlist',  true)
const cacheHitCounter  = new Counter('cache_hit_count')

// ─────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────

// Popular TMDB movie IDs used for detail/similar endpoint tests
const MOVIE_IDS = new SharedArray('movieIds', function () {
  return [
    550,    // Fight Club
    238,    // The Godfather
    680,    // Pulp Fiction
    155,    // The Dark Knight
    13,     // Forrest Gump
    11,     // Star Wars: A New Hope
    120,    // The Lord of the Rings
    278,    // The Shawshank Redemption
    424,    // Schindler's List
    19404,  // Dilwale Dulhania Le Jayenge
  ]
})

// Popular person/actor IDs
const PERSON_IDS = new SharedArray('personIds', function () {
  return [
    500,   // Tom Cruise
    287,   // Brad Pitt
    1136406, // Tom Holland
    6193,  // Leonardo DiCaprio
    31,    // Tom Hanks
  ]
})

// Search queries representative of real user input
const SEARCH_QUERIES = new SharedArray('searchQueries', function () {
  return [
    'avengers',
    'batman',
    'spider man',
    'inception',
    'interstellar',
    'the matrix',
    'john wick',
    'fast furious',
    'iron man',
    'star wars',
  ]
})

// Genres to use in discover queries
const GENRE_IDS = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36]

// ─────────────────────────────────────────────────────────────
// k6 Options — Scenarios & Thresholds
// ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    /**
     * Main ramp-up scenario — simulates organic traffic growth.
     * Starts at 10 VUs, ramps to 100 VUs over 2 min, holds for 3 min.
     * Tests all endpoint categories (public + protected if JWT provided).
     */
    rampUp: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s',  target: 10  },  // warm-up: 10 VUs for 30s
        { duration: '90s',  target: 100 },  // ramp up to 100 VUs in 1.5 min
        { duration: '3m',   target: 100 },  // sustain 100 VUs for 3 min
        { duration: '30s',  target: 0   },  // ramp down to 0
      ],
      exec: 'mainScenario',
      gracefulStop: '30s',
    },

    /**
     * Public-only soak — lightweight long-running test on cached endpoints.
     * Verifies Redis cache hit ratio under sustained load.
     */
    publicSoak: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
      exec: 'publicEndpoints',
      gracefulStop: '15s',
      startTime: '10s', // start slightly after rampUp warms up Redis
    },

    /**
     * Protected endpoint stress — only runs if JWT_TOKEN is provided.
     * Tests watchlist + notification endpoints under moderate load.
     */
    protectedStress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30 },
        { duration: '2m',  target: 30 },
        { duration: '30s', target: 0  },
      ],
      exec: 'protectedEndpoints',
      gracefulStop: '15s',
      startTime: '30s',
    },
  },

  thresholds: {
    // Overall HTTP request duration — p95 must be under 500ms
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],

    // Overall error rate must stay below 1%
    'http_req_failed': ['rate<0.01'],

    // Custom metric thresholds per endpoint family
    'duration_trending':     ['p(95)<300'],  // cached, should be very fast
    'duration_movie_detail': ['p(95)<400'],  // cached, slightly heavier
    'duration_search':       ['p(95)<800'],  // Elasticsearch, more variable
    'duration_watchlist':    ['p(95)<600'],  // DB-backed, authenticated

    // Custom error rate
    'custom_error_rate': ['rate<0.01'],
  },

  // Summary output options
  summaryTimeUnit: 'ms',
  noConnectionReuse: false,
}

// ─────────────────────────────────────────────────────────────
// Shared HTTP Parameters
// ─────────────────────────────────────────────────────────────

function publicParams() {
  return {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  }
}

function authParams() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': JWT_TOKEN ? `Bearer ${JWT_TOKEN}` : '',
    },
    timeout: '10s',
  }
}

// ─────────────────────────────────────────────────────────────
// Helper — assert response is OK and record custom metrics
// ─────────────────────────────────────────────────────────────

function assertOk(res, label, trend) {
  const success = check(res, {
    [`${label}: status 200`]: (r) => r.status === 200,
    [`${label}: has data`]:   (r) => {
      try {
        const body = JSON.parse(r.body)
        return body.success === true || body.data !== undefined
      } catch {
        return false
      }
    },
  })

  errorRate.add(!success)

  if (trend) {
    trend.add(res.timings.duration)
  }

  // Detect Redis cache hits via X-Cache header (if set by cache middleware)
  if (res.headers['X-Cache'] === 'HIT') {
    cacheHitCounter.add(1)
  }

  return success
}

// ─────────────────────────────────────────────────────────────
// Scenario Implementations
// ─────────────────────────────────────────────────────────────

/**
 * mainScenario — mixed workload: 60% public, 40% protected (if JWT available)
 */
export function mainScenario() {
  const rand = Math.random()

  if (rand < 0.25) {
    testMovieLists()
  } else if (rand < 0.50) {
    testMovieDetail()
  } else if (rand < 0.70) {
    testSearch()
  } else if (rand < 0.80) {
    testGenresAndDiscover()
  } else if (rand < 0.90) {
    testPersons()
  } else {
    testProtectedEndpoints()
  }

  sleep(Math.random() * 1 + 0.5) // think time: 0.5–1.5s
}

/**
 * publicEndpoints — only test public cached endpoints
 */
export function publicEndpoints() {
  const rand = Math.random()

  if (rand < 0.40) {
    testMovieLists()
  } else if (rand < 0.70) {
    testMovieDetail()
  } else if (rand < 0.85) {
    testGenresAndDiscover()
  } else {
    testPersons()
  }

  sleep(Math.random() * 0.5 + 0.2) // lighter think time for soak
}

/**
 * protectedEndpoints — only test authenticated endpoints
 */
export function protectedEndpoints() {
  if (!JWT_TOKEN) {
    // Skip if no JWT configured — just probe health
    const res = http.get(`${API}/health`, publicParams())
    check(res, { 'health: status 200': (r) => r.status === 200 })
    sleep(1)
    return
  }

  testProtectedEndpoints()
  sleep(Math.random() * 1 + 0.5)
}

// ─────────────────────────────────────────────────────────────
// Test Groups — Public Endpoints
// ─────────────────────────────────────────────────────────────

function testMovieLists() {
  group('Movie Lists (Public, Cached)', () => {
    // Trending — most commonly accessed endpoint
    const trending = http.get(`${API}/movies/trending?window=day&page=1`, publicParams())
    assertOk(trending, 'GET /movies/trending', trendingDuration)

    sleep(0.2)

    // Now Playing
    const nowPlaying = http.get(`${API}/movies/now-playing?page=1`, publicParams())
    assertOk(nowPlaying, 'GET /movies/now-playing', null)

    sleep(0.2)

    // Popular
    const popular = http.get(`${API}/movies/popular?page=1`, publicParams())
    assertOk(popular, 'GET /movies/popular', null)

    sleep(0.2)

    // Upcoming
    const upcoming = http.get(`${API}/movies/upcoming?page=1`, publicParams())
    assertOk(upcoming, 'GET /movies/upcoming', null)
  })
}

function testMovieDetail() {
  group('Movie Detail (Public, Cached)', () => {
    // Pick a random movie ID from our fixed list
    const movieId = MOVIE_IDS[Math.floor(Math.random() * MOVIE_IDS.length)]

    const detail = http.get(`${API}/movies/${movieId}`, publicParams())
    assertOk(detail, `GET /movies/${movieId}`, detailDuration)

    sleep(0.3)

    // Also test similar movies
    const similar = http.get(`${API}/movies/${movieId}/similar`, publicParams())
    assertOk(similar, `GET /movies/${movieId}/similar`, null)
  })
}

function testSearch() {
  group('Search (Elasticsearch)', () => {
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)]
    const encoded = encodeURIComponent(query)

    const search = http.get(`${API}/search?q=${encoded}&page=1`, publicParams())
    assertOk(search, `GET /search?q=${query}`, searchDuration)

    sleep(0.3)

    // Also test suggestions endpoint
    const suggestions = http.get(`${API}/search/suggestions?q=${encoded}`, publicParams())
    // Suggestions may return 200 or 204 — either is acceptable
    check(suggestions, {
      'GET /search/suggestions: status ok': (r) => r.status === 200 || r.status === 204,
    })
  })
}

function testGenresAndDiscover() {
  group('Genres & Discover (Public, Cached)', () => {
    // Genre list — heavily cached (7 days TTL)
    const genres = http.get(`${API}/genres`, publicParams())
    assertOk(genres, 'GET /genres', null)

    sleep(0.2)

    // Discover with random genre
    const genreId = GENRE_IDS[Math.floor(Math.random() * GENRE_IDS.length)]
    const discover = http.get(
      `${API}/discover?genre=${genreId}&sort=popularity.desc&page=1`,
      publicParams()
    )
    assertOk(discover, `GET /discover?genre=${genreId}`, null)
  })
}

function testPersons() {
  group('Person Detail (Public, Cached)', () => {
    const personId = PERSON_IDS[Math.floor(Math.random() * PERSON_IDS.length)]

    const detail = http.get(`${API}/persons/${personId}`, publicParams())
    assertOk(detail, `GET /persons/${personId}`, null)

    sleep(0.2)

    const credits = http.get(`${API}/persons/${personId}/credits`, publicParams())
    assertOk(credits, `GET /persons/${personId}/credits`, null)
  })
}

// ─────────────────────────────────────────────────────────────
// Test Groups — Protected Endpoints
// ─────────────────────────────────────────────────────────────

function testProtectedEndpoints() {
  group('Protected Endpoints (Authenticated)', () => {
    const params = authParams()

    // GET /watchlists — user's watchlist
    const watchlists = http.get(`${API}/watchlists`, params)
    const watchlistOk = check(watchlists, {
      'GET /watchlists: status 200 or 401': (r) =>
        r.status === 200 || r.status === 401, // 401 if token expired/missing
    })

    if (watchlists.status === 200) {
      watchlistDuration.add(watchlists.timings.duration)
    }

    sleep(0.3)

    // GET /notifications — user's notifications
    const notifications = http.get(`${API}/notifications?page=1`, params)
    check(notifications, {
      'GET /notifications: status 200 or 401': (r) =>
        r.status === 200 || r.status === 401,
    })

    sleep(0.2)
  })
}

// ─────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────

/**
 * setup() runs once before all VUs start.
 * Verifies the server is reachable and logs config.
 */
export function setup() {
  console.log(`[k6] Target: ${BASE_URL}`)
  console.log(`[k6] Auth:   ${JWT_TOKEN ? 'JWT token provided' : 'No JWT — protected endpoints will be skipped'}`)

  // Health check
  const res = http.get(`${API}/health`, publicParams())
  const ok = check(res, {
    'setup: server is healthy': (r) => r.status === 200,
  })

  if (!ok) {
    console.error(`[k6] Server health check FAILED (${res.status}). Ensure server is running at ${BASE_URL}`)
    // k6 does not support aborting from setup — test will still run but likely fail
  } else {
    console.log('[k6] Server health check passed ✓')
  }

  return { baseUrl: BASE_URL, apiPrefix: '/api/v1' }
}

/**
 * teardown() runs once after all VUs finish.
 * Logs summary statistics.
 */
export function teardown(data) {
  console.log(`[k6] Test completed. Target was: ${data.baseUrl}${data.apiPrefix}`)
  console.log('[k6] Review the summary above for threshold results.')
  console.log('[k6] Check p95 < 500ms and error rate < 1% to pass.')
}
