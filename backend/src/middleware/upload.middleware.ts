import multer from 'multer'
import { AppError } from '../utils/AppError'

const allowedAvatarMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedAvatarMimeTypes.has(file.mimetype)) {
      cb(new AppError('Avatar must be a JPEG, PNG, or WebP image', 400, 'INVALID_AVATAR_TYPE'))
      return
    }

    cb(null, true)
  },
})
