import Joi from 'joi'

// ─────────────────────────────────────────────────────────────
// Schema 1: Main search query
// Used by: GET /search?q=&page=
// ─────────────────────────────────────────────────────────────

export const searchQuerySchema = Joi.object({
  q: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': '"q" must not be empty',
    'any.required': '"q" query param is required',
    'string.min': '"q" must be at least 1 character',
    'string.max': '"q" must not exceed 200 characters',
  }),
  page: Joi.number().integer().min(1).default(1),
})

// ─────────────────────────────────────────────────────────────
// Schema 2: Autocomplete suggestions
// Used by: GET /search/suggestions?q=
// ─────────────────────────────────────────────────────────────

export const suggestionQuerySchema = Joi.object({
  q: Joi.string().trim().min(1).max(100).required().messages({
    'string.empty': '"q" must not be empty',
    'any.required': '"q" query param is required',
  }),
})
