import passport from 'passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { config } from './index'

type UserRole = 'user' | 'admin'

interface JwtPayload {
  sub?: string
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
      (payload: JwtPayload, done) => {
        if (!payload.sub) {
          return done(null, false)
        }

        const role: UserRole = payload.role === 'admin' ? 'admin' : 'user'

        return done(null, {
          id: String(payload.sub),
          role,
          email: payload.email,
        })
      }
    )
  )

  isPassportInitialized = true
}
