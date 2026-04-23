import { NextFunction, Request, Response } from 'express'
import passport from 'passport'
import { redisKeys, redisService } from '../services/redis.service'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { verifyAccessToken } from '../utils/jwt'
import { UserModel } from '../models/User.model'

type AuthUserLean = {
  _id: unknown
  email: string
  displayName: string
  role: 'user' | 'admin'
  isEmailVerified: boolean
  preferences?: {
    language?: 'vi' | 'en'
    theme?: 'light' | 'dark' | 'system'
    favoriteGenres?: number[]
  }
}

type UserModelAdapter = {
  findById: (id: string) => {
    select: (fields: string) => {
      lean: <T>() => Promise<T | null>
    }
  }
}

const userModel = UserModel as unknown as UserModelAdapter

function extractAccessToken(req: Request): string {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  const [scheme, token] = authHeader.trim().split(/\s+/)
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  return token
}

async function authenticateRequest(req: Request): Promise<void> {
  let payload

  try {
    payload = verifyAccessToken(extractAccessToken(req))
  } catch {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  const isBlacklisted = await redisService.exists(redisKeys.authAccessBlacklist(payload.jti))
  if (isBlacklisted) {
    throw new AppError('Token has been revoked', 401, 'UNAUTHORIZED')
  }

  const user = await userModel
    .findById(payload.sub)
    .select('_id email displayName role isEmailVerified preferences')
    .lean<AuthUserLean>()

  if (!user) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  const authenticatedUser: Express.User = {
    id: String(user._id),
    role: user.role,
    email: user.email,
    displayName: user.displayName,
    isEmailVerified: user.isEmailVerified,
    preferences: {
      language: user.preferences?.language ?? 'vi',
      theme: user.preferences?.theme ?? 'system',
      favoriteGenres: user.preferences?.favoriteGenres ?? [],
    },
    jti: payload.jti,
  }

  if (typeof payload.exp === 'number') {
    authenticatedUser.exp = payload.exp
  }

  req.user = authenticatedUser

  ;(req.user as Express.User & { userId: string }).userId = payload.sub
}

const accessTokenAuthMiddleware = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  await authenticateRequest(req)
  next()
})

export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  accessTokenAuthMiddleware(req, res, next)
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  accessTokenAuthMiddleware(req, res, next)
}

function runPassportAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: unknown, user: Express.User | false) => {
    if (err) {
      next(err as Error)
      return
    }

    if (!user) {
      next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'))
      return
    }

    req.user = user
    next()
  })(req, res, next)
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  runPassportAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      next(new AppError('Forbidden', 403, 'FORBIDDEN'))
      return
    }

    next()
  })
}
