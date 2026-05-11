/**
 * fcm.service.ts — Firebase Cloud Messaging (FCM) Push Notification Service
 *
 * Architecture decisions:
 *  - Graceful no-op: every public method checks `getFirebaseAdmin()` first.
 *    If Firebase is unconfigured the method logs a warning and returns without
 *    throwing, so callers (BullMQ workers, etc.) never crash on missing config.
 *  - Chunking: FCM's sendEachForMulticast() accepts at most 500 tokens per
 *    call.  `sendToDevice()` splits large arrays into ≤500-token chunks and
 *    fans out concurrently via Promise.all().
 *  - Token cleanup: stale/invalid tokens are removed from the User document in
 *    a single $pull atomic update immediately after each batch response is
 *    parsed, preventing repeated failures on subsequent sends.
 */

import admin from 'firebase-admin'
import type { MulticastMessage } from 'firebase-admin/messaging'
import { getFirebaseAdmin } from '../config/firebase'
import { UserModel } from '../models/User.model'
import logger from '../utils/logger'

// ─── Constants ────────────────────────────────────────────────────────────────

/** FCM hard limit on tokens per multicast request. */
const FCM_CHUNK_SIZE = 500

/**
 * FCM error codes that indicate a device token is permanently invalid and
 * should be pruned from the user's token list.
 */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** FCM message payload limit for notification/data messages. */
const FCM_PAYLOAD_BYTE_LIMIT = 4096

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FcmNotificationPayload {
  title: string
  body: string
  /** Arbitrary key-value string pairs forwarded to the device app. */
  data?: Record<string, string>
}

export class FcmPayloadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FcmPayloadValidationError'
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Split an array into consecutive sub-arrays of at most `size` elements.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

function validatePayloadSize(payload: FcmNotificationPayload): void {
  const payloadBytes = Buffer.byteLength(
    JSON.stringify({
      notification: {
        title: payload.title,
        body: payload.body,
      },
      ...(payload.data ? { data: payload.data } : {}),
    }),
    'utf8'
  )

  if (payloadBytes > FCM_PAYLOAD_BYTE_LIMIT) {
    throw new FcmPayloadValidationError(
      `FCM payload is ${payloadBytes} bytes, exceeding the ${FCM_PAYLOAD_BYTE_LIMIT} byte limit`
    )
  }
}

/**
 * Remove permanently-invalid FCM tokens from a user document.
 * Uses a single atomic $pull so the operation is safe under concurrency.
 */
async function pruneInvalidTokens(userId: string, invalidTokens: string[]): Promise<void> {
  if (invalidTokens.length === 0) return

  try {
    await UserModel.updateOne({ _id: userId }, { $pull: { fcmTokens: { $in: invalidTokens } } })
    logger.info('[FCM] Pruned invalid tokens', { userId, count: invalidTokens.length })
  } catch (err) {
    // Non-fatal — log and continue; tokens will be pruned on the next send.
    logger.warn('[FCM] Failed to prune invalid tokens', { userId, err })
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a push notification to an explicit list of FCM registration tokens.
 *
 * Handles chunking automatically and cleans up invalid tokens after each
 * batch.  `userId` is needed only for the token-cleanup step; pass an empty
 * string if you are calling this outside a user context.
 *
 * @param userId      - MongoDB user ID (used for token pruning only)
 * @param tokens      - FCM device registration tokens
 * @param payload     - Notification title, body, and optional data
 */
export async function sendToDevice(
  userId: string,
  tokens: string[],
  payload: FcmNotificationPayload
): Promise<void> {
  // ── Graceful no-op guard ────────────────────────────────────────────────
  const firebaseApp = getFirebaseAdmin()
  if (!firebaseApp) {
    logger.warn('[FCM] sendToDevice called but Firebase is in skip mode — notification suppressed', {
      userId,
      tokenCount: tokens.length,
    })
    return
  }

  if (tokens.length === 0) return

  validatePayloadSize(payload)

  let messaging
  try {
    messaging = admin.messaging(firebaseApp)
  } catch (err) {
    logger.error('[FCM] Firebase Messaging is unavailable — notification suppressed', { userId, err })
    return
  }

  // ── Fan-out: process all chunks concurrently ────────────────────────────
  const tokenChunks = chunk(tokens, FCM_CHUNK_SIZE)

  await Promise.all(
    tokenChunks.map(async (chunkTokens) => {
      const message: MulticastMessage = {
        tokens: chunkTokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        // Forward extra data as string key-value pairs to the device app.
        ...(payload.data ? { data: payload.data } : {}),
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }

      let batchResponse
      try {
        batchResponse = await messaging.sendEachForMulticast(message)
      } catch (err) {
        // Network-level failure — the Worker's retry policy will re-attempt.
        logger.error('[FCM] sendEachForMulticast failed', { userId, err })
        throw err
      }

      logger.info('[FCM] Batch sent', {
        userId,
        total: chunkTokens.length,
        successCount: batchResponse.successCount,
        failureCount: batchResponse.failureCount,
      })

      // ── Token cleanup: collect tokens with permanent errors ───────────
      const invalidTokens: string[] = []

      batchResponse.responses.forEach((resp, index) => {
        if (!resp.success && resp.error) {
          const failedToken = chunkTokens[index]
          if (!failedToken) {
            logger.warn('[FCM] Response index had no matching token', { userId, index })
            return
          }

          const code = resp.error.code
          if (INVALID_TOKEN_CODES.has(code)) {
            invalidTokens.push(failedToken)
          } else {
            // Transient error — log for diagnostics but do NOT prune.
            logger.warn('[FCM] Transient delivery error', {
              userId,
              token: failedToken.slice(0, 12) + '…', // avoid logging full token
              errorCode: code,
            })
          }
        }
      })

      await pruneInvalidTokens(userId, invalidTokens)
    })
  )
}

/**
 * Send a push notification to all registered devices of a single user.
 *
 * Fetches `fcmTokens` from the User document then delegates to `sendToDevice`.
 * Safe to call when the user has no registered tokens — exits silently.
 *
 * @param userId      - MongoDB user ID
 * @param payload     - Notification title, body, and optional data
 */
export async function sendToUser(userId: string, payload: FcmNotificationPayload): Promise<void> {
  // ── Graceful no-op guard ────────────────────────────────────────────────
  const firebaseApp = getFirebaseAdmin()
  if (!firebaseApp) {
    logger.warn('[FCM] sendToUser called but Firebase is in skip mode — notification suppressed', { userId })
    return
  }

  validatePayloadSize(payload)

  // Fetch only the fcmTokens field to minimize document transfer size.
  const user = await UserModel.findById(userId, { fcmTokens: 1 }).lean()
  if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
    logger.info('[FCM] No FCM tokens registered for user — notification skipped', { userId })
    return
  }

  await sendToDevice(userId, user.fcmTokens as string[], payload)
}

/** Convenience export — consumed by the notification worker. */
export const fcmService = { sendToDevice, sendToUser }
