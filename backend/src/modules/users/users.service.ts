import type { Types } from 'mongoose'
import { UserModel } from '../../models/User.model'
import { AppError } from '../../utils/AppError'

type UserProvider = 'local' | 'google' | 'facebook'
type UserRole = 'user' | 'admin'

export interface UserPreferencesDto {
  language: 'vi' | 'en'
  theme: 'light' | 'dark' | 'system'
  favoriteGenres: number[]
}

export interface UserProfileDto {
  id: string
  email: string
  displayName: string
  avatar?: string
  provider: UserProvider
  isVerified: boolean
  isEmailVerified: boolean
  role: UserRole
  preferences: UserPreferencesDto
  createdAt: Date
  updatedAt: Date
}

export interface UpdateProfilePayload {
  displayName?: string
  preferences?: Partial<UserPreferencesDto>
}

type UserLeanDoc = {
  _id: Types.ObjectId
  email: string
  displayName: string
  avatar?: string
  provider: UserProvider
  isEmailVerified?: boolean
  role: UserRole
  preferences?: Partial<UserPreferencesDto>
  createdAt: Date
  updatedAt: Date
}

function toProfileDto(user: UserLeanDoc): UserProfileDto {
  const profile: UserProfileDto = {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    provider: user.provider,
    isVerified: user.isEmailVerified ?? false,
    isEmailVerified: user.isEmailVerified ?? false,
    role: user.role,
    preferences: {
      language: user.preferences?.language ?? 'vi',
      theme: user.preferences?.theme ?? 'system',
      favoriteGenres: user.preferences?.favoriteGenres ?? [],
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }

  if (typeof user.avatar === 'string') {
    profile.avatar = user.avatar
  }

  return profile
}

async function findUserProfile(userId: string): Promise<UserLeanDoc> {
  const user = await UserModel.findById(userId)
    .select('-passwordHash -fcmTokens -providerId')
    .lean<UserLeanDoc>()

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  return user
}

export async function getProfile(userId: string): Promise<UserProfileDto> {
  const user = await findUserProfile(userId)
  return toProfileDto(user)
}

export async function updateProfile(
  userId: string,
  payload: UpdateProfilePayload
): Promise<UserProfileDto> {
  const set: Record<string, unknown> = {}

  if (typeof payload.displayName === 'string') {
    set.displayName = payload.displayName
  }

  if (payload.preferences?.language) {
    set['preferences.language'] = payload.preferences.language
  }

  if (payload.preferences?.theme) {
    set['preferences.theme'] = payload.preferences.theme
  }

  if (payload.preferences?.favoriteGenres) {
    set['preferences.favoriteGenres'] = payload.preferences.favoriteGenres
  }

  if (Object.keys(set).length === 0) {
    throw new AppError('No profile fields to update', 400, 'EMPTY_PROFILE_UPDATE')
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: set },
    { returnDocument: 'after', runValidators: true }
  )
    .select('-passwordHash -fcmTokens -providerId')
    .lean<UserLeanDoc>()

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  return toProfileDto(user)
}

