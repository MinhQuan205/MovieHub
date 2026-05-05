import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { apiResponse } from '../../utils/apiResponse'
import { AppError } from '../../utils/AppError'
import * as usersService from './users.service'
import type { UpdateProfilePayload } from './users.service'
import { generatePresignedUploadUrl } from '../../services/s3.service'

function requireUserId(req: Request): string {
  const userId = req.user?.id
  if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  return userId
}

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const profile = await usersService.getProfile(userId)

  res.status(200).json(apiResponse.success({ profile }))
})

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const payload = req.body as UpdateProfilePayload
  const profile = await usersService.updateProfile(userId, payload)

  res.status(200).json(apiResponse.success({ profile }))
})

export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const result = await usersService.uploadAvatar(userId, req.file)

  res.status(200).json(apiResponse.success(result))
})

const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedAvatarMime = (typeof ALLOWED_AVATAR_MIME_TYPES)[number]

function isAllowedAvatarMime(value: string): value is AllowedAvatarMime {
  return (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(value)
}

export const getUploadUrl = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const { fileType } = req.body as { fileType?: unknown }

  if (typeof fileType !== 'string' || !isAllowedAvatarMime(fileType)) {
    throw new AppError(
      `fileType is required and must be one of: ${ALLOWED_AVATAR_MIME_TYPES.join(', ')}`,
      400,
      'INVALID_FILE_TYPE'
    )
  }

  const result = await generatePresignedUploadUrl(userId, fileType)

  res.status(200).json(
    apiResponse.success(
      {
        uploadUrl: result.uploadUrl,
        fileUrl: result.fileUrl,
        key: result.key,
        expiresIn: result.expiresIn,
      },
      'PRESIGNED_URL_GENERATED'
    )
  )
})

export const usersController = {
  getProfile,
  updateProfile,
  uploadAvatar,
  getUploadUrl
}
