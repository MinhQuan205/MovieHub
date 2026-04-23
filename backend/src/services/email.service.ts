import sendGridMail from '@sendgrid/mail'
import { config } from '../config'
import { AppError } from '../utils/AppError'

function ensureEmailConfig(): { apiKey: string; from: string; baseUrl: string } {
  const apiKey = config.email.sendGridApiKey
  const from = config.email.from
  const baseUrl = config.email.mobileDeepLinkUrl

  if (!apiKey || !from || !baseUrl) {
    throw new AppError('Email service is not configured', 500, 'EMAIL_SERVICE_NOT_CONFIGURED')
  }

  return { apiKey, from, baseUrl }
}

function buildLink(baseUrl: string, path: string, token: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${normalizedBase}${path}?token=${encodeURIComponent(token)}`
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { apiKey, from } = ensureEmailConfig()
  sendGridMail.setApiKey(apiKey)

  await sendGridMail.send({
    to,
    from,
    subject,
    html,
  })
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const { baseUrl } = ensureEmailConfig()
  const verificationLink = buildLink(baseUrl, '/verify-email', token)

  await sendEmail(
    email,
    'Verify your MovieHub account',
    `<p>Welcome to MovieHub.</p><p>Please verify your email:</p><p><a href="${verificationLink}">${verificationLink}</a></p>`
  )
}

export async function sendResetPasswordEmail(email: string, token: string): Promise<void> {
  const { baseUrl } = ensureEmailConfig()
  const resetLink = buildLink(baseUrl, '/reset-password', token)

  await sendEmail(
    email,
    'Reset your MovieHub password',
    `<p>We received a password reset request.</p><p>Use this link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`
  )
}
