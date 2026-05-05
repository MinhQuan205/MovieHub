import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { apiResponse } from '../../utils/apiResponse'
import { AppError } from '../../utils/AppError'
import * as usersService from './users.service'
import type { UpdateProfilePayload } from './users.service'

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

export const usersController = {
  getProfile,
  updateProfile,
}
