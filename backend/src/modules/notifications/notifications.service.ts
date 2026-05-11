import type { Types } from 'mongoose'
import { NotificationModel } from '../../models/Notification.model'
import { UserModel } from '../../models/User.model'
import { enqueueNotification } from '../../jobs/queues/notificationQueue'
import { AppError } from '../../utils/AppError'
import { buildMeta, type PaginationMeta } from '../../utils/pagination'

export type NotificationType = 'movie_release' | 'review_like' | 'system'

export interface NotificationDto {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, string>
  isRead: boolean
  createdAt: Date
}

export interface NotificationListResult {
  notifications: NotificationDto[]
  meta: PaginationMeta
  unreadCount: number
}

type NotificationLeanDoc = {
  _id: Types.ObjectId
  userId: Types.ObjectId
  type: NotificationType
  title: string
  body: string
  data?: Map<string, string> | Record<string, string>
  isRead: boolean
  createdAt: Date
}

type UserFcmTokensLeanDoc = {
  _id: Types.ObjectId
  fcmTokens?: string[]
}

function normalizeData(data?: Map<string, string> | Record<string, string>): Record<string, string> | undefined {
  if (!data) return undefined
  if (data instanceof Map) return Object.fromEntries(data.entries())
  return data
}

function toDto(doc: NotificationLeanDoc): NotificationDto {
  const dto: NotificationDto = {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    isRead: doc.isRead,
    createdAt: doc.createdAt,
  }

  const data = normalizeData(doc.data)
  if (data) dto.data = data

  return dto
}

export async function getNotifications(userId: string, page: number, limit: number): Promise<NotificationListResult> {
  const skip = (page - 1) * limit

  const [notifications, total, unreadCount] = await Promise.all([
    NotificationModel.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<NotificationLeanDoc[]>(),
    NotificationModel.countDocuments({ userId }),
    NotificationModel.countDocuments({ userId, isRead: false }),
  ])

  return {
    notifications: notifications.map(toDto),
    meta: buildMeta(total, page, limit),
    unreadCount,
  }
}

export async function markAsRead(notificationId: string, userId: string): Promise<NotificationDto> {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true } },
    { returnDocument: 'after', runValidators: true }
  ).lean<NotificationLeanDoc>()

  if (!notification) {
    throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND')
  }

  return toDto(notification)
}

export async function markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
  const result = await NotificationModel.updateMany({ userId, isRead: false }, { $set: { isRead: true } })

  return { modifiedCount: result.modifiedCount }
}

export async function registerFcmToken(userId: string, token: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $addToSet: { fcmTokens: token } }, { runValidators: true })
}

export async function removeFcmToken(userId: string, token: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $pull: { fcmTokens: token } })
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<NotificationDto> {
  const doc = await NotificationModel.create({
    userId,
    type,
    title,
    body,
    ...(data ? { data } : {}),
  })

  const notification = await NotificationModel.findById(doc._id).lean<NotificationLeanDoc>()
  if (!notification) throw new AppError('Notification creation failed', 500, 'INTERNAL_ERROR')

  const user = await UserModel.findById(userId, { fcmTokens: 1 }).lean<UserFcmTokensLeanDoc>()
  if (user?.fcmTokens && user.fcmTokens.length > 0) {
    await enqueueNotification({
      userId,
      title,
      body,
      ...(data ? { data } : {}),
    })
  }

  return toDto(notification)
}
