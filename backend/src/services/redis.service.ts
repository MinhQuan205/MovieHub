import { getRedisClient, isRedisConnected } from '../config/redis'

function ensureRedisReady(): void {
  if (!isRedisConnected()) {
    throw new Error('Redis client is not ready')
  }
}

export const redisService = {
  async get(key: string): Promise<string | null> {
    ensureRedisReady()
    return getRedisClient().get(key)
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    ensureRedisReady()

    if (ttlSeconds && ttlSeconds > 0) {
      await getRedisClient().set(key, value, 'EX', ttlSeconds)
      return
    }

    await getRedisClient().set(key, value)
  },

  async del(key: string): Promise<number> {
    ensureRedisReady()
    return getRedisClient().del(key)
  },

  async exists(key: string): Promise<boolean> {
    ensureRedisReady()
    const result = await getRedisClient().exists(key)
    return result === 1
  },

  async ttl(key: string): Promise<number> {
    ensureRedisReady()
    return getRedisClient().ttl(key)
  },

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds)
  },

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  },
}

export const redisKeys = {
  authAccessBlacklist: (jti: string) => `auth:blacklist:access:${jti}`,
  authRefresh: (userId: string, tokenId: string) => `auth:refresh:${userId}:${tokenId}`,
  authEmailVerify: (token: string) => `auth:email-verify:${token}`,
  authPasswordReset: (token: string) => `auth:password-reset:${token}`,
  authTask: (task: 'verify' | 'reset', tokenHash: string) => `auth:task:${task}:${tokenHash}`,
}
