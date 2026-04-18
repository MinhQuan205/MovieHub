import { Request, Response, NextFunction } from 'express'

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>

export const asyncHandler =
  (fn: AsyncRoute) => (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next)
  }