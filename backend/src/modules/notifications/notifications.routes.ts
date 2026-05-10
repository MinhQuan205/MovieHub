import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
  registerFcmToken,
  removeFcmToken,
} from './notifications.controller'
import {
  fcmTokenSchema,
  notificationIdParamSchema,
  paginationQuerySchema,
} from './notifications.validation'

const router = Router()

router.get('/notifications', requireAuth, validate(paginationQuerySchema, 'query'), getNotifications)

router.post('/notifications/fcm-token', requireAuth, validate(fcmTokenSchema), registerFcmToken)

router.delete('/notifications/fcm-token', requireAuth, validate(fcmTokenSchema), removeFcmToken)

router.put('/notifications/read-all', requireAuth, markAllAsRead)

router.put(
  '/notifications/:id/read',
  requireAuth,
  validate(notificationIdParamSchema, 'params'),
  markAsRead
)

export default router
