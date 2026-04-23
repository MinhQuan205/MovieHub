import { randomUUID } from 'node:crypto'
import jwt, { SignOptions } from 'jsonwebtoken'
import { config } from '../config'

export type TokenType = 'access' | 'refresh'

export interface TokenPayload {
  sub: string
  jti: string
  type: TokenType
  exp?: number
}

export interface GenerateTokenInput {
  sub: string
}

function signToken(
  payload: TokenPayload,
  secret: string,
  expiresIn: NonNullable<SignOptions['expiresIn']>
): string {
  return jwt.sign(payload, secret, { expiresIn })
}

function verifyToken(token: string, secret: string, expectedType: TokenType): TokenPayload {
  const decoded = jwt.verify(token, secret)

  return validateTokenPayload(decoded, expectedType)
}

function verifyTokenAllowExpired(token: string, secret: string, expectedType: TokenType): TokenPayload {
  const decoded = jwt.verify(token, secret, { ignoreExpiration: true })
  return validateTokenPayload(decoded, expectedType)
}

function validateTokenPayload(decoded: unknown, expectedType: TokenType): TokenPayload {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload')
  }

  const payload = decoded as Partial<TokenPayload>

  if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || payload.type !== expectedType) {
    throw new Error('Invalid token payload')
  }

  const normalizedPayload: TokenPayload = {
    sub: payload.sub,
    jti: payload.jti,
    type: payload.type,
  }

  if (typeof payload.exp === 'number') {
    normalizedPayload.exp = payload.exp
  }

  return normalizedPayload
}

export function generateAccessToken(payload: GenerateTokenInput): string {
  return signToken(
    {
      sub: payload.sub,
      jti: randomUUID(),
      type: 'access',
    },
    config.jwt.accessSecret,
    config.jwt.accessExpiresIn as NonNullable<SignOptions['expiresIn']>
  )
}

export function generateRefreshToken(payload: GenerateTokenInput): string {
  return signToken(
    {
      sub: payload.sub,
      jti: randomUUID(),
      type: 'refresh',
    },
    config.jwt.refreshSecret,
    config.jwt.refreshExpiresIn as NonNullable<SignOptions['expiresIn']>
  )
}

export function verifyAccessToken(token: string): TokenPayload {
  return verifyToken(token, config.jwt.accessSecret, 'access')
}

export function verifyRefreshToken(token: string): TokenPayload {
  return verifyToken(token, config.jwt.refreshSecret, 'refresh')
}

export function verifyAccessTokenAllowExpired(token: string): TokenPayload {
  return verifyTokenAllowExpired(token, config.jwt.accessSecret, 'access')
}
