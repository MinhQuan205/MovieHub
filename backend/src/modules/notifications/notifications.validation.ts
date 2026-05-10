import Joi from 'joi'

export const fcmTokenSchema = Joi.object({
  token: Joi.string().trim().min(1).required().messages({
    'string.empty': 'FCM token is required',
    'any.required': 'FCM token is required',
  }),
})

export const notificationIdParamSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .required()
    .messages({
      'string.pattern.base': 'Invalid notification ID format',
    }),
})

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
})
