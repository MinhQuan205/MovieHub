import { NextFunction, Request, Response } from 'express'
import { AnySchema, ValidationOptions } from 'joi'
import { AppError } from '../utils/AppError'

type RequestSource = 'body' | 'query' | 'params'

const defaultOptions: ValidationOptions = {
  abortEarly: false,
  stripUnknown: true,
}

export function validate(
  schema: AnySchema,
  source: RequestSource = 'body',
  options: ValidationOptions = defaultOptions
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const data = req[source]
    const { value, error } = schema.validate(data, options)

    if (error) {
      const message = error.details.map((detail) => detail.message).join('; ')
      next(new AppError(message, 400, 'VALIDATION_ERROR'))
      return
    }

    ;(req as unknown as Record<RequestSource, unknown>)[source] = value
    next()
  }
}
