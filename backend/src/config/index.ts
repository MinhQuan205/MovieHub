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

  // Elasticsearch
  ELASTICSEARCH_URL: Joi.string().allow('').uri({ scheme: ['http', 'https'] }).default('').messages({
    'string.uri': 'ELASTICSEARCH_URL must be a valid http/https URL',
  }),
  ELASTICSEARCH_USERNAME: Joi.string().allow('').default(''),
  ELASTICSEARCH_PASSWORD: Joi.string().allow('').default(''),
  ELASTICSEARCH_API_KEY: Joi.string().allow('').default(''),

  API_PREFIX: Joi.string().pattern(/^\/[a-zA-Z0-9/_-]*$/).default('/api/v1'),
  CORS_ORIGIN: Joi.string().allow('').default(''),

  HEALTH_STRICT_READINESS: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  DATABASE_CONNECT_RETRIES: Joi.number().integer().min(1).default(5),
  DATABASE_CONNECT_RETRY_DELAY_MS: Joi.number().integer().min(100).default(2000),
  RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).default(100),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(1).default(60),
  AUTH_RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).default(10),

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
  SENDGRID_API_KEY: Joi.string().allow(''),
  EMAIL_FROM: Joi.string().allow('').email(),
  MOBILE_DEEP_LINK_URL: Joi.string().allow(''),

  AWS_REGION: Joi.string().allow('').default(''),
  AWS_DEFAULT_REGION: Joi.string().allow('').default(''),
  AWS_S3_BUCKET: Joi.string().allow('').default(''),
  AWS_S3_PUBLIC_BASE_URL: Joi.string().allow('').uri({ scheme: ['http', 'https'] }).default(''),
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
const elasticsearchUrl = String(env.ELASTICSEARCH_URL || '')
const elasticsearchUsername = String(env.ELASTICSEARCH_USERNAME || '')
const elasticsearchPassword = String(env.ELASTICSEARCH_PASSWORD || '')
const elasticsearchApiKey = String(env.ELASTICSEARCH_API_KEY || '')
const corsOrigins = String(env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const jwtAccessSecret = String(env.JWT_ACCESS_SECRET || '')
const jwtRefreshSecret = String(env.JWT_REFRESH_SECRET || '')
const tmdbApiKey = String(env.TMDB_API_KEY || '')
const googleClientId = String(env.GOOGLE_CLIENT_ID || '')
const googleClientSecret = String(env.GOOGLE_CLIENT_SECRET || '')
const googleCallbackUrl = String(env.GOOGLE_CALLBACK_URL || '')
const sendGridApiKey = String(env.SENDGRID_API_KEY || '')
const emailFrom = String(env.EMAIL_FROM || '')
const mobileDeepLinkUrl = String(env.MOBILE_DEEP_LINK_URL || '')
const awsRegion = String(env.AWS_REGION || env.AWS_DEFAULT_REGION || '')
const awsS3Bucket = String(env.AWS_S3_BUCKET || '')
const awsS3PublicBaseUrl = String(env.AWS_S3_PUBLIC_BASE_URL || '')
const isStrictEnv = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production'
const strictReadiness = Boolean(env.HEALTH_STRICT_READINESS) || isStrictEnv

if (isStrictEnv) {
  const missing: string[] = []

  if (!mongoUri) missing.push('MONGODB_URI (or legacy MONGODB_URL)')
  if (!redisUrl) missing.push('REDIS_URL')
  if (!jwtAccessSecret) missing.push('JWT_ACCESS_SECRET')
  if (!jwtRefreshSecret) missing.push('JWT_REFRESH_SECRET')
  if (!tmdbApiKey) missing.push('TMDB_API_KEY')
  if (corsOrigins.length === 0) missing.push('CORS_ORIGIN')
  if (!sendGridApiKey) missing.push('SENDGRID_API_KEY')
  if (!emailFrom) missing.push('EMAIL_FROM')
  if (!mobileDeepLinkUrl) missing.push('MOBILE_DEEP_LINK_URL')
  if (!awsRegion) missing.push('AWS_REGION (or AWS_DEFAULT_REGION)')
  if (!awsS3Bucket) missing.push('AWS_S3_BUCKET')

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
  cors: {
    origins: corsOrigins,
  },

  health: {
    strictReadiness,
  },

  database: {
    connectRetries: Number(env.DATABASE_CONNECT_RETRIES),
    connectRetryDelayMs: Number(env.DATABASE_CONNECT_RETRY_DELAY_MS),
  },

  rateLimit: {
    windowSeconds: Number(env.RATE_LIMIT_WINDOW_SECONDS),
    maxRequests: Number(env.RATE_LIMIT_MAX_REQUESTS),
    authWindowSeconds: Number(env.AUTH_RATE_LIMIT_WINDOW_SECONDS),
    authMaxRequests: Number(env.AUTH_RATE_LIMIT_MAX_REQUESTS),
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

  email: {
    sendGridApiKey,
    from: emailFrom,
    mobileDeepLinkUrl,
  },

  s3: {
    region: awsRegion,
    bucket: awsS3Bucket,
    publicBaseUrl: awsS3PublicBaseUrl,
  },

  elasticsearch: {
    url: elasticsearchUrl,
    username: elasticsearchUsername,
    password: elasticsearchPassword,
    apiKey: elasticsearchApiKey,
  },
}
