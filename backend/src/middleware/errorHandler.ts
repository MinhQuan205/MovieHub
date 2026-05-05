import { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { AppError } from '../utils/AppError'
import { apiResponse } from '../utils/apiResponse'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(apiResponse.error(err.code, err.message))
    return
  }

  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'AVATAR_FILE_TOO_LARGE' : 'UPLOAD_ERROR'
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Avatar file must not exceed 5MB' : err.message

    res.status(400).json(apiResponse.error(code, message))
    return
  }

  console.error(err)
  res.status(500).json(apiResponse.error('INTERNAL_ERROR', 'Something went wrong'))
}
