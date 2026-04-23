import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
	forgotPasswordController,
	loginController,
	logoutController,
	meController,
	refreshController,
	registerController,
	resetPasswordController,
	verifyEmailController,
} from './auth.controller'
import {
	authTokenParamSchema,
	forgotPasswordSchema,
	loginSchema,
	registerSchema,
	resetPasswordSchema,
} from './auth.validation'

const router = Router()

router.post('/auth/register', validate(registerSchema), registerController)
router.post('/auth/login', validate(loginSchema), loginController)
router.get('/auth/me', requireAuth, meController)
router.post('/auth/logout', requireAuth, logoutController)
router.post('/auth/refresh', refreshController)
router.get('/auth/verify-email/:token', validate(authTokenParamSchema, 'params'), verifyEmailController)
router.post('/auth/forgot-password', validate(forgotPasswordSchema), forgotPasswordController)
router.post(
	'/auth/reset-password/:token',
	validate(authTokenParamSchema, 'params'),
	validate(resetPasswordSchema),
	resetPasswordController
)

export default router
