jest.mock('../config/redis', () => ({
  isRedisConnected: jest.fn(),
  getRedisClient: jest.fn(),
}))

import { getRedisClient, isRedisConnected } from '../config/redis'
import { redisKeys, redisService } from './redis.service'

type MockRedisClient = {
  get: jest.Mock<Promise<string | null>, [string]>
  set: jest.Mock<Promise<'OK'>, [string, string, ...unknown[]]>
  del: jest.Mock<Promise<number>, [string]>
  exists: jest.Mock<Promise<number>, [string]>
  ttl: jest.Mock<Promise<number>, [string]>
}

const mockedIsRedisConnected = isRedisConnected as jest.MockedFunction<typeof isRedisConnected>
const mockedGetRedisClient = getRedisClient as jest.MockedFunction<typeof getRedisClient>

describe('redisService', () => {
  let client: MockRedisClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsRedisConnected.mockReturnValue(true)

    client = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
    }

    mockedGetRedisClient.mockReturnValue(client as unknown as ReturnType<typeof getRedisClient>)
  })

  it('sets and gets string values', async () => {
    client.get.mockResolvedValue('value')

    await redisService.set('key', 'value')
    const value = await redisService.get('key')

    expect(client.set).toHaveBeenCalledWith('key', 'value')
    expect(value).toBe('value')
  })

  it('sets values with ttl', async () => {
    await redisService.set('key', 'value', 60)

    expect(client.set).toHaveBeenCalledWith('key', 'value', 'EX', 60)
  })

  it('sets and gets json values', async () => {
    client.get.mockResolvedValue(JSON.stringify({ id: '1' }))

    await redisService.setJson('json:key', { id: '1' }, 30)
    const value = await redisService.getJson<{ id: string }>('json:key')

    expect(client.set).toHaveBeenCalledWith('json:key', JSON.stringify({ id: '1' }), 'EX', 30)
    expect(value).toEqual({ id: '1' })
  })

  it('deletes keys and reads ttl', async () => {
    client.del.mockResolvedValue(1)
    client.ttl.mockResolvedValue(10)

    await expect(redisService.del('key')).resolves.toBe(1)
    await expect(redisService.ttl('key')).resolves.toBe(10)
  })

  it('throws when redis is not connected', async () => {
    mockedIsRedisConnected.mockReturnValue(false)

    await expect(redisService.get('key')).rejects.toThrow('Redis client is not ready')
  })

  it('exposes auth key conventions for week 2', () => {
    expect(redisKeys.authAccessBlacklist('jti')).toBe('auth:blacklist:access:jti')
    expect(redisKeys.authRefresh('user', 'token')).toBe('auth:refresh:user:token')
    expect(redisKeys.authEmailVerify('token')).toBe('auth:email-verify:token')
    expect(redisKeys.authPasswordReset('token')).toBe('auth:password-reset:token')
  })
})
