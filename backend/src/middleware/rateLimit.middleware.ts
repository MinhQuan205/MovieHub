import { NextFunction, Request, Response } from 'express'
import { config } from '../config'
import { apiResponse } from '../utils/apiResponse'
import { getRedisClient, isRedisConnected } from '../config/redis'

function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    const firstIp = forwardedFor.split(',')[0] ?? ''
    if (firstIp) return firstIp.trim()
  }

  return req.ip || 'unknown'
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.path.includes('/health')) {
    next()
    return
  }

  if (!isRedisConnected()) {
    if (config.health.strictReadiness) {
      res.status(503).json(apiResponse.error('DEPENDENCY_UNAVAILABLE', 'Rate limit dependency is unavailable'))
      return
    }

    next()
    return
  }

  try {
    const client = getRedisClient()
    const isAuthRoute = req.path.startsWith(`${config.apiPrefix}/auth`) || req.path.startsWith('/auth')
    const windowSeconds = isAuthRoute ? config.rateLimit.authWindowSeconds : config.rateLimit.windowSeconds
    const maxRequests = isAuthRoute ? config.rateLimit.authMaxRequests : config.rateLimit.maxRequests
    const bucket = isAuthRoute ? 'auth' : 'general'
    const key = `rate-limit:${bucket}:${getClientIp(req)}`

    const currentCount = await client.incr(key)

    if (currentCount === 1) {
      await client.expire(key, windowSeconds)
    }

    const ttl = await client.ttl(key)
    const remaining = Math.max(maxRequests - currentCount, 0)

    res.setHeader('X-RateLimit-Limit', String(maxRequests))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(ttl))

    if (currentCount > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(ttl, 0)))
      res.status(429).json(apiResponse.error('TOO_MANY_REQUESTS', 'Too many requests, please try again later'))
      return
    }

    next()
  } catch (err) {
    console.error('Rate limit middleware failed, continuing without rate limiting:', err)

    if (config.health.strictReadiness) {
      res.status(503).json(apiResponse.error('DEPENDENCY_UNAVAILABLE', 'Rate limit dependency failed'))
      return
    }

    next()
  }
}
