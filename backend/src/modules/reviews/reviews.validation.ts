import Joi from 'joi'

export const movieIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'Movie ID must be a number',
    'number.integer': 'Movie ID must be an integer',
    'number.positive': 'Movie ID must be positive',
  }),
})

export const reviewIdParamSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .required()
    .messages({
      'string.pattern.base': 'Invalid review ID format',
    }),
})

export const createReviewSchema = Joi.object({
  rating: Joi.number().min(1).max(10).required().messages({
    'number.min': 'Rating must be at least 1',
    'number.max': 'Rating must be at most 10',
    'any.required': 'Rating is required',
  }),
  content: Joi.string().trim().max(2000).allow('').default('').messages({
    'string.max': 'Review content must not exceed 2000 characters',
  }),
})

export const updateReviewSchema = Joi.object({
  rating: Joi.number().min(1).max(10).messages({
    'number.min': 'Rating must be at least 1',
    'number.max': 'Rating must be at most 10',
  }),
  content: Joi.string().trim().max(2000).allow('').messages({
    'string.max': 'Review content must not exceed 2000 characters',
  }),
}).min(1)
