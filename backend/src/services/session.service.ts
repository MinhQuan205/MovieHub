import { redisService } from './redis.service'

const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7

function getRefreshTokenKey(userId: string, jti: string): string {
  return `auth:refresh:${userId}:${jti}`
}

export async function storeRefreshToken(
  userId: string,
  jti: string,
  hashedToken: string,
  ttl = REFRESH_TOKEN_TTL_SECONDS
): Promise<void> {
  await redisService.set(getRefreshTokenKey(userId, jti), hashedToken, ttl)
}

export async function getRefreshToken(userId: string, jti: string): Promise<string | null> {
  return redisService.get(getRefreshTokenKey(userId, jti))
}

export async function deleteRefreshToken(userId: string, jti: string): Promise<number> {
  return redisService.del(getRefreshTokenKey(userId, jti))
}
