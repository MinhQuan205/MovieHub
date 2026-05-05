import { randomUUID } from 'node:crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config'
import { AppError } from '../utils/AppError'

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!config.s3.region || !config.s3.bucket) {
    throw new AppError('S3 is not configured', 500, 'S3_NOT_CONFIGURED')
  }

  if (!s3Client) {
    s3Client = new S3Client({ region: config.s3.region })
  }

  return s3Client
}

type AvatarMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

type AvatarFileType = {
  mime: AvatarMimeType
  extension: '.jpg' | '.png' | '.webp'
}

const AVATAR_MIME_TO_EXTENSION: Record<AvatarMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const PRESIGNED_URL_EXPIRES_SECONDS = 300 // 5 minutes

export interface PresignedUploadResult {
  /** PUT URL — client uploads directly to this URL */
  uploadUrl: string
  /** Public URL to store in DB after upload completes */
  fileUrl: string
  /** S3 object key — for reference */
  key: string
  /** Expiry in seconds */
  expiresIn: number
}

function detectAvatarFileType(buffer: Buffer): AvatarFileType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: '.jpg' }
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: '.png' }
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: '.webp' }
  }

  return null
}

function getPublicUrl(key: string): string {
  if (config.s3.publicBaseUrl) {
    return `${config.s3.publicBaseUrl.replace(/\/$/, '')}/${key}`
  }

  return `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`
}

export async function uploadAvatarToS3(userId: string, file: Express.Multer.File): Promise<string> {
  if (!file.buffer || file.size === 0) {
    throw new AppError('Avatar file is required', 400, 'AVATAR_FILE_REQUIRED')
  }

  const fileType = detectAvatarFileType(file.buffer)
  if (!fileType || fileType.mime !== file.mimetype) {
    throw new AppError('Avatar file content must be a valid JPEG, PNG, or WebP image', 400, 'INVALID_AVATAR_CONTENT')
  }

  const key = `avatars/${userId}/${randomUUID()}${fileType.extension}`

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: fileType.mime,
    })
  )

  return getPublicUrl(key)
}

/**
 * Generate a presigned PUT URL for direct client → S3 upload.
 *
 * Flow:
 *   1. Client calls POST /users/avatar/upload-url with { fileType: 'image/jpeg' }
 *   2. Backend returns { uploadUrl, fileUrl, key, expiresIn }
 *   3. Client PUTs the file directly to uploadUrl
 *   4. Client calls PUT /users/profile (or dedicated endpoint) with { avatar: fileUrl }
 */
export async function generatePresignedUploadUrl(
  userId: string,
  mimeType: string
): Promise<PresignedUploadResult> {
  if (!config.s3.region || !config.s3.bucket) {
    throw new AppError('S3 is not configured', 500, 'S3_NOT_CONFIGURED')
  }

  const extension = AVATAR_MIME_TO_EXTENSION[mimeType as AvatarMimeType]
  if (!extension) {
    throw new AppError(
      `Unsupported file type: ${mimeType}. Allowed: image/jpeg, image/png, image/webp`,
      400,
      'UNSUPPORTED_FILE_TYPE'
    )
  }

  const key = `avatars/${userId}/${randomUUID()}${extension}`

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: mimeType,
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGNED_URL_EXPIRES_SECONDS,
  })

  return {
    uploadUrl,
    fileUrl: getPublicUrl(key),
    key,
    expiresIn: PRESIGNED_URL_EXPIRES_SECONDS,
  }
}
