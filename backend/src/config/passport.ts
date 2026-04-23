import passport from 'passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { config } from './index'
import { isRedisConnected } from './redis'
import { UserModel } from '../models/User.model'
import { redisKeys, redisService } from '../services/redis.service'

type UserRole = 'user' | 'admin'

interface JwtPayload {
  sub?: string
  jti?: string
  role?: UserRole
  email?: string
}

let isPassportInitialized = false

export function initPassport(): void {
  if (isPassportInitialized) return

  if (!config.jwt.accessSecret) {
    throw new Error('JWT_ACCESS_SECRET is required to initialize Passport JWT strategy')
  }

  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: config.jwt.accessSecret,
      },
      async (payload: JwtPayload, done) => {
        if (!payload.sub) {
          return done(null, false)
        }

        try {
          if (payload.jti && isRedisConnected()) {
            const isBlacklisted = await redisService.exists(redisKeys.authAccessBlacklist(payload.jti))
            if (isBlacklisted) {
              return done(null, false)
            }
          }

          const user = await UserModel.findById(payload.sub)
            .select('email role isEmailVerified')
            .lean<{ _id: unknown; email: string; role: UserRole; isEmailVerified: boolean }>()

          if (!user) {
            return done(null, false)
          }

          return done(null, {
            id: String(user._id),
            role: user.role,
            email: user.email,
            isEmailVerified: user.isEmailVerified,
          })
        } catch (err) {
          return done(err, false)
        }
      }
    )
  )

  isPassportInitialized = true
}
