import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { validate } from '../../middleware/validate.middleware'
import { usersController } from './users.controller'
import { updateProfileSchema } from './users.validation'

const router = Router()

router.get('/profile', requireAuth, usersController.getProfile)
router.put('/profile', requireAuth, validate(updateProfileSchema), usersController.updateProfile)

export default router

    