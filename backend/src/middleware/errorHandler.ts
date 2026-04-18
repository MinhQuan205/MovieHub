import { NextFunction, Request, Response } from 'express'
import { AppError } from '../utils/AppError'
import { apiResponse } from '../utils/apiResponse'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(apiResponse.error(err.code, err.message))
    return
  }

  console.error(err)
  res.status(500).json(apiResponse.error('INTERNAL_ERROR', 'Something went wrong'))
}