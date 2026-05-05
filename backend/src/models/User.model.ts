import { Schema, model, models } from 'mongoose'

const preferencesSchema = new Schema(
  {
    language: { type: String, enum: ['vi', 'en'], default: 'vi' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    favoriteGenres: { type: [Number], default: [] },
  },
  { _id: false }
)

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: {
      type: String,
      minlength: 8,
      required(this: { provider: 'local' | 'google' | 'facebook' }) {
        return this.provider === 'local'
      },
    },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    avatar: { type: String, trim: true },
    provider: { type: String, enum: ['local', 'google', 'facebook'], default: 'local', required: true },
    providerId: {
      type: String,
      trim: true,
      required(this: { provider: 'local' | 'google' | 'facebook' }) {
        return this.provider === 'google' || this.provider === 'facebook'
      },
    },
    isEmailVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    fcmTokens: {
      type: [String],
      default: [],
      validate: {
        validator(tokens: string[]) {
          return new Set(tokens).size === tokens.length
        },
        message: 'fcmTokens must be unique',
      },
    },
    preferences: { type: preferencesSchema, default: () => ({}) },
  },
  { timestamps: true }
)

userSchema.index({ email: 1 }, { unique: true })
userSchema.index(
  { provider: 1, providerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      provider: { $in: ['google', 'facebook'] },
      providerId: { $exists: true },
    },
  }
)

export const UserModel = models.User || model('User', userSchema)
