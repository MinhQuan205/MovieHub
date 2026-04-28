import Joi from 'joi'

export const registerSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one letter and one number',
    }),
  displayName: Joi.string().trim().min(3).max(50).required(),
})

export const loginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().required(),
})

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
})

export const resetPasswordSchema = Joi.object({
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one letter and one number',
    }),
})

export const authTokenParamSchema = Joi.object({
  token: Joi.string().trim().min(32).required(),
})

export const authTokenQuerySchema = Joi.object({
  token: Joi.string().trim().min(32).required(),
})
