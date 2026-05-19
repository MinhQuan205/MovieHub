import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import passport from 'passport'
import path from 'path'
import fs from 'fs'
import yaml from 'js-yaml'
import swaggerUi from 'swagger-ui-express'
import { config } from './config'
import { initPassport } from './config/passport'
import healthRoutes from './modules/health/health.routes'
import authRoutes from './modules/auth/auth.routes'
import moviesRouter from './modules/movies/movies.routes'
import searchRouter from './modules/search/search.routes'
import watchlistRouter from './modules/watchlist/watchlist.routes'
import reviewsRouter from './modules/reviews/reviews.routes'
import usersRouter from './modules/users/users.routes'
import notificationsRouter from './modules/notifications/notifications.routes'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { rateLimitMiddleware } from './middleware/rateLimit.middleware'
import { notFoundHandler } from './middleware/notFound.middleware'
import { registerQueueDashboard } from './admin/queueDashboard'

// Load swagger.yaml from project root (backend/swagger.yaml)
const swaggerDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, '..', 'swagger.yaml'), 'utf8')
) as Record<string, unknown>

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
app.use('/api/users', usersRouter)

// Movies module — mounted at three prefixes:
//   /api/v1/movies/*   → list endpoints & detail
//   /api/v1/genres     → genre list
//   /api/v1/discover   → discover with filters
app.use(config.apiPrefix, moviesRouter)

// Search module — /api/v1/search, /api/v1/search/suggestions
// ⚠ No cacheMiddleware — search results are never cached (guide §5.2)
app.use(config.apiPrefix, searchRouter)

// Watchlist module — /api/v1/watchlists/*  (all routes require JWT)
app.use(config.apiPrefix, watchlistRouter)

// Reviews module — /api/v1/movies/:id/reviews, /api/v1/reviews/:id
app.use(config.apiPrefix, reviewsRouter)

// Notifications module — /api/v1/notifications/*
app.use(config.apiPrefix, notificationsRouter)

registerQueueDashboard(app)

// ── Swagger UI (/api/docs) ────────────────────────────────────────────────────
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'MovieHub API Docs',
    swaggerOptions: { persistAuthorization: true },
  })
)

app.use(notFoundHandler)
app.use(errorHandler)

export default app

