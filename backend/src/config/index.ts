import dotenv from 'dotenv'
import Joi from 'joi'

dotenv.config()

type NodeEnv = 'development' | 'test' | 'staging' | 'production'

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(4000),
  MONGODB_URL: Joi.string().allow('').pattern(/^mongodb(\+srv)?:\/\//).messages({
    'string.pattern.base': 'MONGODB_URL must start with mongodb:// or mongodb+srv://',
  }),
  MONGODB_URI: Joi.string().allow('').pattern(/^mongodb(\+srv)?:\/\//).messages({
    'string.pattern.base': 'MONGODB_URI must start with mongodb:// or mongodb+srv://',
  }),
  REDIS_URL: Joi.string().allow('').pattern(/^rediss?:\/\//).messages({
    'string.pattern.base': 'REDIS_URL must start with redis:// or rediss://',
  }),
  API_PREFIX: Joi.string().pattern(/^\/[a-zA-Z0-9/_-]*$/).default('/api/v1'),

  HEALTH_STRICT_READINESS: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).default(100),

  JWT_ACCESS_SECRET: Joi.string().allow('').min(16).messages({
    'string.min': 'JWT_ACCESS_SECRET must be at least 16 characters',
  }),
  JWT_REFRESH_SECRET: Joi.string().allow('').min(16).messages({
    'string.min': 'JWT_REFRESH_SECRET must be at least 16 characters',
  }),
  JWT_ACCESS_EXPIRES: Joi.string().pattern(/^\d+[smhd]$/).default('15m').messages({
    'string.pattern.base': 'JWT_ACCESS_EXPIRES must match format like 15m, 1h, 7d',
  }),
  JWT_REFRESH_EXPIRES: Joi.string().pattern(/^\d+[smhd]$/).default('7d').messages({
    'string.pattern.base': 'JWT_REFRESH_EXPIRES must match format like 15m, 1h, 7d',
  }),

  TMDB_API_KEY: Joi.string().allow('').min(10).messages({
    'string.min': 'TMDB_API_KEY looks too short',
  }),
  TMDB_BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('https://api.themoviedb.org/3'),
  TMDB_IMAGE_BASE: Joi.string().uri({ scheme: ['http', 'https'] }).default('https://image.tmdb.org/t/p'),

  GOOGLE_CLIENT_ID: Joi.string().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').min(16).messages({
    'string.min': 'GOOGLE_CLIENT_SECRET must be at least 16 characters',
  }),
  GOOGLE_CALLBACK_URL: Joi.string().allow('').uri({ scheme: ['http', 'https'] }),
}).unknown(true)

const { value: env, error } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true,
})

if (error) {
  const details = error.details.map((detail) => detail.message).join('; ')
  throw new Error(`Environment validation failed: ${details}`)
}

const mongoUri = String(env.MONGODB_URL || env.MONGODB_URI || '')
const redisUrl = String(env.REDIS_URL || '')
const jwtAccessSecret = String(env.JWT_ACCESS_SECRET || '')
const jwtRefreshSecret = String(env.JWT_REFRESH_SECRET || '')
const tmdbApiKey = String(env.TMDB_API_KEY || '')
const googleClientId = String(env.GOOGLE_CLIENT_ID || '')
const googleClientSecret = String(env.GOOGLE_CLIENT_SECRET || '')
const googleCallbackUrl = String(env.GOOGLE_CALLBACK_URL || '')
const isStrictEnv = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production'
const strictReadiness = Boolean(env.HEALTH_STRICT_READINESS) || isStrictEnv

if (isStrictEnv) {
  const missing: string[] = []

  if (!mongoUri) missing.push('MONGODB_URL (or legacy MONGODB_URI)')
  if (!redisUrl) missing.push('REDIS_URL')
  if (!jwtAccessSecret) missing.push('JWT_ACCESS_SECRET')
  if (!jwtRefreshSecret) missing.push('JWT_REFRESH_SECRET')
  if (!tmdbApiKey) missing.push('TMDB_API_KEY')

  if (missing.length > 0) {
    throw new Error(`Environment validation failed in ${String(env.NODE_ENV)}: missing ${missing.join(', ')}`)
  }
}

const providedGoogleCount = [googleClientId, googleClientSecret, googleCallbackUrl].filter(Boolean).length
if (providedGoogleCount > 0 && providedGoogleCount < 3) {
  throw new Error(
    'Environment validation failed: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL must be set together'
  )
}

export const config = {
  nodeEnv: env.NODE_ENV as NodeEnv,
  port: Number(env.PORT),
  mongoUri,
  redisUrl,
  apiPrefix: String(env.API_PREFIX),

  health: {
    strictReadiness,
  },

  rateLimit: {
    windowSeconds: Number(env.RATE_LIMIT_WINDOW_SECONDS),
    maxRequests: Number(env.RATE_LIMIT_MAX_REQUESTS),
  },

  jwt: {
    accessSecret: jwtAccessSecret,
    refreshSecret: jwtRefreshSecret,
    accessExpiresIn: String(env.JWT_ACCESS_EXPIRES),
    refreshExpiresIn: String(env.JWT_REFRESH_EXPIRES),
  },

  tmdb: {
    apiKey: tmdbApiKey,
    baseUrl: String(env.TMDB_BASE_URL),
    imageBase: String(env.TMDB_IMAGE_BASE),
  },

  googleOAuth: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    callbackUrl: googleCallbackUrl,
  },
}