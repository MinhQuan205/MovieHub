import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { upload } from '../../middleware/upload.middleware'
import { validate } from '../../middleware/validate.middleware'
import { usersController } from './users.controller'
import { updateProfileSchema } from './users.validation'

const router = Router()

router.get('/profile', requireAuth, usersController.getProfile)
router.put('/profile', requireAuth, validate(updateProfileSchema), usersController.updateProfile)
router.post('/avatar', requireAuth, upload.single('avatar'), usersController.uploadAvatar)
router.post('/avatar/upload-url', requireAuth, usersController.getUploadUrl)
export default router
    