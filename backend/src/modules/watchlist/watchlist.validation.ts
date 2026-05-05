import Joi from 'joi'

export const createWatchlistSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required().messages({
    'string.empty': 'Watchlist name is required',
    'string.max': 'Watchlist name must not exceed 50 characters',
  }),
  isPublic: Joi.boolean().default(false),
})

export const updateWatchlistSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).messages({
    'string.empty': 'Watchlist name must not be empty',
    'string.max': 'Watchlist name must not exceed 50 characters',
  }),
  isPublic: Joi.boolean(),
}).min(1)

export const watchlistIdParamSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .required()
    .messages({
      'string.pattern.base': 'Invalid watchlist ID format',
    }),
})

export const addMovieSchema = Joi.object({
  tmdbId: Joi.number().integer().positive().required().messages({
    'number.base': 'tmdbId must be a number',
    'any.required': 'tmdbId is required',
  }),
  tmdbTitle: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': 'tmdbTitle is required',
    'string.max': 'tmdbTitle must not exceed 200 characters',
  }),
  posterPath: Joi.string().trim().allow('').optional(),
  note: Joi.string().trim().max(500).allow('').optional().messages({
    'string.max': 'Note must not exceed 500 characters',
  }),
})

export const tmdbIdParamSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .required()
    .messages({ 'string.pattern.base': 'Invalid watchlist ID format' }),
  tmdbId: Joi.number().integer().positive().required().messages({
    'number.base': 'tmdbId param must be a number',
    'any.required': 'tmdbId param is required',
  }),
})
