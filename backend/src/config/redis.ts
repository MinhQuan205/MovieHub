import Redis from 'ioredis'
import { config } from './index'

class RedisRuntime {
  private static instance: RedisRuntime
  private client: Redis | null = null
  private ready = false

  private constructor() {}

  static getInstance(): RedisRuntime {
    if (!RedisRuntime.instance) {
      RedisRuntime.instance = new RedisRuntime()
    }

    return RedisRuntime.instance
  }

  private createClient(): Redis {
    const client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      // Mandatory namespace prefix — prevents key collisions with BullMQ
      // (moviehub:bull:) and any other Redis tenants on the same instance.
      keyPrefix: 'moviehub:cache:',
    })

    client.on('connect', () => {
      console.log('Redis connecting...')
    })

    client.on('ready', () => {
      this.ready = true
      console.log('Redis connected')
    })

    client.on('error', (err: Error) => {
      console.error('Redis error:', err.message)
    })

    client.on('close', () => {
      this.ready = false
      console.warn('Redis connection closed')
    })

    client.on('reconnecting', () => {
      console.warn('Redis reconnecting...')
    })

    return client
  }

  async connect(): Promise<void> {
    if (!config.redisUrl) {
      if (config.nodeEnv === 'production') {
        throw new Error('REDIS_URL is required in production environment')
      }

      console.warn('REDIS_URL is missing, skip Redis connection in local skeleton mode')
      return
    }

    if (!this.client) {
      this.client = this.createClient()
    }

    if (this.client.status === 'ready' || this.client.status === 'connecting') {
      return
    }

    try {
      await this.client.connect()
    } catch (err) {
      this.ready = false

      if (config.nodeEnv === 'production') {
        throw err
      }

      this.client.disconnect()
      this.client = null
      console.warn('Failed to connect Redis in non-production mode, continue without Redis')
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return

    try {
      await this.client.quit()
    } finally {
      this.ready = false
      this.client = null
    }
  }

  getClient(): Redis {
    if (!this.client || !this.ready) {
      throw new Error('Redis client is not ready. Call connectRedis() before using Redis.')
    }

    return this.client
  }

  isConnected(): boolean {
    return this.ready
  }
}

const redisRuntime = RedisRuntime.getInstance()

export async function connectRedis(): Promise<void> {
  await redisRuntime.connect()
}

export async function disconnectRedis(): Promise<void> {
  await redisRuntime.disconnect()
}

export function getRedisClient(): Redis {
  return redisRuntime.getClient()
}

export function isRedisConnected(): boolean {
  return redisRuntime.isConnected()
}
