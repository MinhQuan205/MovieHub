import { CookieOptions, Request, Response } from 'express'
import { config } from '../../config'
import { AppError } from '../../utils/AppError'
import { asyncHandler } from '../../utils/asyncHandler'
import { apiResponse } from '../../utils/apiResponse'
import {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  forgotPassword,
  login,
  logout,
  refreshSession,
  register,
  resetPassword,
  verifyEmail,
} from './auth.service'

const REFRESH_COOKIE_NAME = 'refreshToken'
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh'

interface AuthResponseUser {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  isEmailVerified: boolean
}

interface AuthSuccessData {
  user: AuthResponseUser
  accessToken: string
}

function getRefreshCookieOptions(): CookieOptions {
  const isSecureEnv = config.nodeEnv === 'production' || config.nodeEnv === 'staging'

  return {
    httpOnly: true,
    secure: isSecureEnv,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  }
}

function toAuthSuccessData(result: {
  user: AuthResponseUser
  accessToken: string
}): AuthSuccessData {
  return {
    user: result.user,
    accessToken: result.accessToken,
  }
}

function getRefreshCookieClearOptions(): CookieOptions {
  const cookieOptions = getRefreshCookieOptions()

  return {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
  }
}

function extractAccessTokenFromRequest(req: Request): string | null {
  const authorizationHeader = req.headers.authorization
  if (!authorizationHeader) return null

  const [scheme, token] = authorizationHeader.trim().split(/\s+/)
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null
  }

  return token
}

function extractRefreshTokenFromRequest(req: Request): string | null {
  const requestWithCookies = req as Request & { cookies?: Record<string, string> }
  const fromCookiesObject = requestWithCookies.cookies?.[REFRESH_COOKIE_NAME]
  if (fromCookiesObject) return fromCookiesObject

  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null

  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === REFRESH_COOKIE_NAME && valueParts.length > 0) {
      return decodeURIComponent(valueParts.join('='))
    }
  }

  return null
}

function getTokenParam(value: string | string[] | undefined): string {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  throw new AppError('Token is required', 400, 'TOKEN_REQUIRED')
}

function getTokenFromRequest(req: Request): string {
  const tokenFromParams = getOptionalToken(req.params.token)
  if (tokenFromParams) {
    return tokenFromParams
  }

  const tokenFromQuery = getOptionalToken(req.query.token)
  if (tokenFromQuery) {
    return tokenFromQuery
  }

  throw new AppError('Token is required', 400, 'TOKEN_REQUIRED')
}

function getOptionalToken(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  return null
}

export const registerController = asyncHandler(async (req: Request, res: Response) => {
  const result = await register(req.body as RegisterInput)
  const data = toAuthSuccessData(result)

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions())
  res.status(201).json(apiResponse.success(data, 'REGISTER_SUCCESS'))
})

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await login(req.body as LoginInput)
  const data = toAuthSuccessData(result)

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions())
  res.status(200).json(apiResponse.success(data, 'LOGIN_SUCCESS'))
})

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = extractRefreshTokenFromRequest(req)
  const accessToken = extractAccessTokenFromRequest(req)
  const logoutInput: {
    accessJti?: string | null
    accessExp?: number | null
    accessToken?: string | null
    refreshToken?: string | null
  } = {
    accessToken,
    refreshToken,
  }

  if (typeof req.user?.jti === 'string') {
    logoutInput.accessJti = req.user.jti
  }

  if (typeof req.user?.exp === 'number') {
    logoutInput.accessExp = req.user.exp
  }

  try {
    await logout(logoutInput)
  } finally {
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieClearOptions())
  }

  res.status(200).json(apiResponse.success({}, 'LOGOUT_SUCCESS'))
})

export const refreshController = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = extractRefreshTokenFromRequest(req)

  if (!refreshToken) {
    throw new AppError('Refresh token is required', 401, 'REFRESH_TOKEN_REQUIRED')
  }

  const result = await refreshSession(refreshToken)

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions())
  res.status(200).json(
    apiResponse.success(
      {
        accessToken: result.accessToken,
      },
      'TOKEN_REFRESH_SUCCESS'
    )
  )
})

export const meController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.id || !req.user.email || !req.user.displayName) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  const user = {
    id: req.user.id,
    email: req.user.email,
    displayName: req.user.displayName,
    role: req.user.role,
    isEmailVerified: req.user.isEmailVerified,
    preferences: req.user.preferences,
  }

  res.status(200).json(apiResponse.success({ user }, 'ME_SUCCESS'))
})

export const verifyEmailController = asyncHandler(async (req: Request, res: Response) => {
  const token = getTokenFromRequest(req)
  await verifyEmail(token)
  res.status(200).json(apiResponse.success({}, 'EMAIL_VERIFIED_SUCCESS'))
})

export const forgotPasswordController = asyncHandler(async (req: Request, res: Response) => {
  await forgotPassword(req.body as ForgotPasswordInput)
  res
    .status(200)
    .json(apiResponse.success({}, 'If the email exists, a reset link has been sent to your address'))
})

export const resetPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const token = getTokenParam(req.params.token)
  const body = req.body as { password: string }
  await resetPassword({ token, password: body.password })
  res.status(200).json(apiResponse.success({}, 'PASSWORD_RESET_SUCCESS'))
})
