import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { apiResponse } from '../../utils/apiResponse'
import { AppError } from '../../utils/AppError'
import {
  getNotifications as getNotificationsService,
  markAllAsRead as markAllAsReadService,
  markAsRead as markAsReadService,
  registerFcmToken as registerFcmTokenService,
  removeFcmToken as removeFcmTokenService,
} from './notifications.service'

function requireUserId(req: Request): string {
  const id = req.user?.id
  if (!id) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  return id
}

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const page = Number(req.query.page)
  const limit = Number(req.query.limit)

  const result = await getNotificationsService(userId, page, limit)

  res.status(200).json(apiResponse.success(result, 'NOTIFICATIONS_FETCHED'))
})

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const notificationId = req.params.id as string

  const notification = await markAsReadService(notificationId, userId)

  res.status(200).json(apiResponse.success({ notification }, 'NOTIFICATION_MARKED_AS_READ'))
})

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)

  const result = await markAllAsReadService(userId)

  res.status(200).json(apiResponse.success(result, 'NOTIFICATIONS_MARKED_AS_READ'))
})

export const registerFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const { token } = req.body as { token: string }

  await registerFcmTokenService(userId, token)

  res.status(200).json(apiResponse.success({}, 'FCM_TOKEN_REGISTERED'))
})

export const removeFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req)
  const { token } = req.body as { token: string }

  await removeFcmTokenService(userId, token)

  res.status(200).json(apiResponse.success({}, 'FCM_TOKEN_REMOVED'))
})
