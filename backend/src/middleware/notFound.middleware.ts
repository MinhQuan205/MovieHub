import { Request, Response } from 'express'
import { apiResponse } from '../utils/apiResponse'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(apiResponse.error('NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`))
}
