import bcrypt from 'bcrypt'
import { randomBytes } from 'node:crypto'
import { AppError } from '../../utils/AppError'
import { UserModel } from '../../models/User.model'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessTokenAllowExpired,
  verifyRefreshToken,
} from '../../utils/jwt'
import { hashToken } from '../../utils/hash'
import { deleteRefreshToken, getRefreshToken, storeRefreshToken } from '../../services/session.service'
import { redisKeys, redisService } from '../../services/redis.service'
import { sendResetPasswordEmail, sendVerificationEmail } from '../../services/email.service'

const SALT_ROUNDS = 10
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
const REFRESH_GRACE_SECONDS = 45
const AUTH_TASK_TTL_SECONDS = 15 * 60

type AuthTaskType = 'verify' | 'reset'

interface UserPreferences {
  language: 'vi' | 'en'
  theme: 'light' | 'dark' | 'system'
  favoriteGenres: number[]
}

export interface RegisterInput {
  email: string
  password: string
  displayName: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  isEmailVerified: boolean
  preferences: UserPreferences
}

export interface AuthResult {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export interface RefreshResult {
  accessToken: string
  refreshToken: string
}

export interface LogoutInput {
  accessJti?: string | null
  accessExp?: number | null
  accessToken?: string | null
  refreshToken?: string | null
}

type UserShape = {
  _id: unknown
  email: string
  displayName: string
  provider: 'local' | 'google'
  role: 'user' | 'admin'
  isEmailVerified: boolean
  preferences?: {
    language?: 'vi' | 'en'
    theme?: 'light' | 'dark' | 'system'
    favoriteGenres?: number[]
  }
  passwordHash?: string
}

type UserModelAdapter = {
  exists: (filter: Record<string, unknown>) => Promise<unknown>
  create: (doc: Record<string, unknown>) => Promise<{ toObject: () => unknown } | null>
  findOne: (filter: Record<string, unknown>) => {
    select: (fields: string) => {
      lean: <T>() => Promise<T | null>
    }
  }
  findById: (id: string) => {
    select: (fields: string) => {
      lean: <T>() => Promise<T | null>
    }
  }
  findByIdAndUpdate: (
    id: string,
    update: Record<string, unknown>,
    options: Record<string, unknown>
  ) => Promise<unknown>
}

const userModel = UserModel as unknown as UserModelAdapter

export interface ForgotPasswordInput {
  email: string
}

export interface ResetPasswordInput {
  token: string
  password: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toAuthUser(user: UserShape): AuthUser {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    preferences: {
      language: user.preferences?.language ?? 'vi',
      theme: user.preferences?.theme ?? 'system',
      favoriteGenres: user.preferences?.favoriteGenres ?? [],
    },
  }
}

async function createSessionTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = generateAccessToken({ sub: userId })
  const refreshToken = generateRefreshToken({ sub: userId })
  const refreshPayload = verifyRefreshToken(refreshToken)
  const hashedRefreshToken = hashToken(refreshToken)

  await storeRefreshToken(userId, refreshPayload.jti, hashedRefreshToken, REFRESH_TOKEN_TTL_SECONDS)

  return { accessToken, refreshToken }
}

function getRefreshGraceKey(userId: string, jti: string): string {
  return `auth:refresh:grace:${userId}:${jti}`
}

function getRemainingTokenTtl(exp?: number): number {
  if (typeof exp !== 'number') {
    return 0
  }

  const nowInSeconds = Math.floor(Date.now() / 1000)
  return exp - nowInSeconds
}

async function revokeAccessToken(accessToken?: string | null): Promise<void> {
  if (!accessToken) {
    return
  }

  let payload

  try {
    payload = verifyAccessTokenAllowExpired(accessToken)
  } catch {
    return
  }

  const ttlSeconds = getRemainingTokenTtl(payload.exp)
  if (ttlSeconds <= 0) {
    return
  }

  await redisService.set(redisKeys.authAccessBlacklist(payload.jti), '1', ttlSeconds)
}

async function revokeAccessTokenByClaims(jti: string, exp?: number | null): Promise<void> {
  const ttlSeconds = getRemainingTokenTtl(typeof exp === 'number' ? exp : undefined)
  if (ttlSeconds <= 0) {
    return
  }

  await redisService.set(redisKeys.authAccessBlacklist(jti), '1', ttlSeconds)
}

async function revokeRefreshToken(refreshToken?: string | null): Promise<void> {
  if (!refreshToken) {
    return
  }

  let payload

  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    return
  }

  await deleteRefreshToken(payload.sub, payload.jti)
}

export async function logout(input: LogoutInput): Promise<void> {
  const accessRevocationPromise = input.accessJti
    ? revokeAccessTokenByClaims(input.accessJti, input.accessExp)
    : revokeAccessToken(input.accessToken)

  await Promise.all([accessRevocationPromise, revokeRefreshToken(input.refreshToken)])
}

function buildAuthTaskKey(task: AuthTaskType, tokenHash: string): string {
  return redisKeys.authTask(task, tokenHash)
}

async function createAuthTaskToken(task: AuthTaskType, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)

  await redisService.set(buildAuthTaskKey(task, tokenHash), userId, AUTH_TASK_TTL_SECONDS)

  return token
}

async function consumeAuthTaskToken(task: AuthTaskType, token: string): Promise<string> {
  const tokenHash = hashToken(token)
  const key = buildAuthTaskKey(task, tokenHash)
  const userId = await redisService.get(key)

  if (!userId) {
    throw new AppError('Token is invalid or expired', 400, 'INVALID_OR_EXPIRED_TOKEN')
  }

  await redisService.del(key)
  return userId
}

export async function refreshSession(refreshToken: string): Promise<RefreshResult> {
  let payload

  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN')
  }

  const userId = payload.sub
  const jti = payload.jti
  const hashedToken = hashToken(refreshToken)
  const graceKey = getRefreshGraceKey(userId, jti)
  const [storedHashedToken, graceHashedToken] = await Promise.all([
    getRefreshToken(userId, jti),
    redisService.get(graceKey),
  ])

  if (storedHashedToken !== hashedToken && graceHashedToken !== hashedToken) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN')
  }

  // First successful rotation moves the old token into a short grace window to reduce mobile race failures.
  if (storedHashedToken === hashedToken) {
    const deletedCount = await deleteRefreshToken(userId, jti)
    if (deletedCount === 0) {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN')
    }

    await redisService.set(graceKey, hashedToken, REFRESH_GRACE_SECONDS)
  }

  const rotatedTokens = await createSessionTokens(userId)

  return {
    accessToken: rotatedTokens.accessToken,
    refreshToken: rotatedTokens.refreshToken,
  }
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email)
  const displayName = input.displayName.trim()

  const existingUser = await userModel.exists({ email })
  if (existingUser) {
    throw new AppError('Email already exists', 409, 'EMAIL_ALREADY_EXISTS')
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)
  const createdUser = await userModel.create({
    email,
    passwordHash,
    displayName,
    provider: 'local',
  })

  if (!createdUser) {
    throw new AppError('Unable to create user', 500, 'USER_CREATE_FAILED')
  }

  const user = createdUser.toObject() as UserShape
  const authUser = toAuthUser(user)
  const tokens = await createSessionTokens(authUser.id)
  const verificationToken = await createAuthTaskToken('verify', authUser.id)
  await sendVerificationEmail(authUser.email, verificationToken)

  return {
    user: authUser,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email)
  const user = await userModel
    .findOne({ email })
    .select('_id email displayName provider role isEmailVerified passwordHash')
    .lean<UserShape>()

  if (!user || !user.passwordHash) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash)
  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
  }

  const authUser = toAuthUser(user)
  const tokens = await createSessionTokens(authUser.id)

  return {
    user: authUser,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  }
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await userModel
    .findById(userId)
    .select('_id email displayName role isEmailVerified preferences')
    .lean<UserShape>()

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  return toAuthUser(user)
}

export async function verifyEmail(token: string): Promise<void> {
  const userId = await consumeAuthTaskToken('verify', token)

  const updated = await userModel.findByIdAndUpdate(userId, { isEmailVerified: true }, { returnDocument: 'after' })
  if (!updated) {
    throw new AppError('Token is invalid or expired', 400, 'INVALID_OR_EXPIRED_TOKEN')
  }
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const email = normalizeEmail(input.email)
  const user = await userModel
    .findOne({ email })
    .select('_id email provider')
    .lean<{ _id: unknown; email: string; provider: 'local' | 'google' }>()

  if (!user || user.provider !== 'local') {
    return
  }

  const resetToken = await createAuthTaskToken('reset', String(user._id))
  await sendResetPasswordEmail(user.email, resetToken)
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const userId = await consumeAuthTaskToken('reset', input.token)
  const user = await userModel
    .findById(userId)
    .select('_id provider')
    .lean<{ _id: unknown; provider: 'local' | 'google' }>()

  if (!user || user.provider !== 'local') {
    throw new AppError('Token is invalid or expired', 400, 'INVALID_OR_EXPIRED_TOKEN')
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)
  await userModel.findByIdAndUpdate(userId, { passwordHash }, { returnDocument: 'after' })
}
