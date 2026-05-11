/**
 * firebase.ts — Firebase Admin SDK Singleton
 *
 * Design decisions:
 *  - Singleton via module-level variable; the first call to getFirebaseAdmin()
 *    initialises the app and all subsequent calls return the cached instance.
 *  - Graceful-skip: if any of the three required env vars is absent we log a
 *    warning and return null so callers (push-notification service, etc.) can
 *    short-circuit cleanly instead of crashing the process.
 */

import admin from 'firebase-admin'
import { deleteApp, type App } from 'firebase-admin/app'

// ─── State ───────────────────────────────────────────────────────────────────

/** null  → not yet initialised; false → skipped (missing config); App → live */
let firebaseApp: App | null | false = null

// ─── Initialiser ─────────────────────────────────────────────────────────────

/**
 * Initialise the Firebase Admin SDK exactly once.
 *
 * Returns the App instance on success, or `null` when configuration is absent
 * (graceful-skip mode). Callers **must** guard on the return value:
 *
 * ```ts
 * const fb = getFirebaseAdmin()
 * if (!fb) return   // skip silently
 * ```
 */
export function getFirebaseAdmin(): App | null {
  // Already initialised — return cached result immediately.
  if (firebaseApp !== null) {
    return firebaseApp || null
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL

  // Private keys stored in .env as a single line use the literal two-char
  // sequence '\n' instead of an actual newline.  We must replace those back
  // into real newlines so that the RSA key PEM block is parsed correctly.
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY
  const privateKey = rawPrivateKey ? rawPrivateKey.replace(/\\n/g, '\n') : undefined

  // ── Graceful-skip: any variable missing → warn and bail out ──────────────
  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      '[Firebase] Configuration missing (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).' +
        ' Running in skip mode — push notifications will be disabled.'
    )
    // Cache the "skipped" sentinel so we never try again.
    firebaseApp = false
    return null
  }

  // ── Initialise only if no app has been registered yet ────────────────────
  try {
    const existingApp = admin.apps.find((a) => a?.name === '[DEFAULT]')
    if (existingApp) {
      firebaseApp = existingApp
      return firebaseApp
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    })

    return firebaseApp
  } catch (err) {
    console.error('[Firebase] Failed to initialize Admin SDK:', err)
    firebaseApp = false
    return null
  }
}

export async function disconnectFirebaseAdmin(): Promise<void> {
  if (!firebaseApp) return

  try {
    await deleteApp(firebaseApp)
    console.log('[Firebase] Admin SDK app deleted')
  } finally {
    firebaseApp = null
  }
}
