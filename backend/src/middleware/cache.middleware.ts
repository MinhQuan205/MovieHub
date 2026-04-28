import { Request, RequestHandler, Response } from 'express'
import { getRedisClient, isRedisConnected } from '../config/redis'

/**
 * Cache-aside middleware using Redis.
 *
 * - Cache Hit  → respond immediately with cached JSON.
 * - Cache Miss → intercept `res.json()` to store the response in Redis
 *                before sending it to the client.
 *
 * If Redis is unavailable or throws, the request proceeds normally
 * without caching so it never blocks the client.
 */
export const cacheMiddleware = (ttlSeconds: number): RequestHandler => {
  return async (req: Request, res: Response, next): Promise<void> => {
    // Skip caching when Redis is down
    if (!isRedisConnected()) {
      next()
      return
    }

    const cacheKey = `cache:${req.originalUrl}`

    try {
      const cached = await getRedisClient().get(cacheKey)

      // ── Cache Hit ──────────────────────────────────────────────
      if (cached) {
        res.json(JSON.parse(cached))
        return
      }
    } catch (err) {
      console.error('Cache read error, skipping cache:', err)
      next()
      return
    }

    // ── Cache Miss – intercept res.json to store before sending ──
    const originalJson = res.json.bind(res)

    res.json = (body: unknown): Response => {
      // Store in Redis asynchronously; never block the response
      try {
        const serialised = JSON.stringify(body)
        getRedisClient()
          .setex(cacheKey, ttlSeconds, serialised)
          .catch((err: unknown) => {
            console.error('Cache write error:', err)
          })
      } catch (err) {
        console.error('Cache serialisation error:', err)
      }

      // Send the response through the original res.json
      return originalJson(body)
    }

    next()
  }
}
