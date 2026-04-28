import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import passport from 'passport'
import { config } from './config'
import { initPassport } from './config/passport'
import healthRoutes from './modules/health/health.routes'
import authRoutes from './modules/auth/auth.routes'
import moviesRouter from './modules/movies/movies.routes'
import searchRouter from './modules/search/search.routes'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { rateLimitMiddleware } from './middleware/rateLimit.middleware'
import { notFoundHandler } from './middleware/notFound.middleware'

const app = express()

initPassport()

app.use(helmet())
app.use(
  cors({
    origin: config.cors.origins.length > 0 ? config.cors.origins : true,
    credentials: true,
  })
)
app.use(compression())
app.use(express.json())
app.use(requestLogger)
app.use(passport.initialize())
app.use(rateLimitMiddleware)

app.use(config.apiPrefix, healthRoutes)
app.use(config.apiPrefix, authRoutes)

// Movies module — mounted at three prefixes:
//   /api/v1/movies/*   → list endpoints & detail
//   /api/v1/genres     → genre list
//   /api/v1/discover   → discover with filters
app.use(config.apiPrefix, moviesRouter)

// Search module — /api/v1/search, /api/v1/search/suggestions
// ⚠ No cacheMiddleware — search results are never cached (guide §5.2)
app.use(config.apiPrefix, searchRouter)

app.use(notFoundHandler)
app.use(errorHandler)

export default app

