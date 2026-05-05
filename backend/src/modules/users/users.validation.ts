import Joi from 'joi'

export const updateProfileSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(50).messages({
    'string.empty': 'Display name must not be empty',
    'string.min': 'Display name must be at least 2 characters',
    'string.max': 'Display name must not exceed 50 characters',
  }),
  preferences: Joi.object({
    language: Joi.string().valid('vi', 'en'),
    theme: Joi.string().valid('light', 'dark', 'system'),
    favoriteGenres: Joi.array().items(Joi.number().integer().positive()).max(50),
  }).min(1),
}).min(1)
