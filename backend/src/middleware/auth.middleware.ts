import { NextFunction, Request, Response } from 'express'
import passport from 'passport'
import { AppError } from '../utils/AppError'

function runJwtAuth(req: Request, res: Response, next: NextFunction): void {
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

export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  runJwtAuth(req, res, next)
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  runJwtAuth(req, res, next)
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  runJwtAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err as Error)
      return
    }

    if (req.user?.role !== 'admin') {
      next(new AppError('Forbidden', 403, 'FORBIDDEN'))
      return
    }

    next()
  })
}
