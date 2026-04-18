import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import passport from 'passport'
import { config } from './config'
import { initPassport } from './config/passport'
import healthRoutes from './modules/health/health.routes'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { rateLimitMiddleware } from './middleware/rateLimit.middleware'

const app = express()

initPassport()

app.use(helmet())
app.use(cors())
app.use(compression())
app.use(express.json())
app.use(requestLogger)
app.use(passport.initialize())
app.use(rateLimitMiddleware)

app.use(config.apiPrefix, healthRoutes)
app.use(errorHandler)

export default app

