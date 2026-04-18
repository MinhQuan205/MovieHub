import { Schema, model, models } from 'mongoose'

const reviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tmdbMovieId: { type: Number, required: true },
    tmdbTitle: { type: String, required: true, trim: true, maxlength: 300 },
    rating: { type: Number, required: true, min: 1, max: 10 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    containsSpoiler: { type: Boolean, default: false },
    likes: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
      validate: {
        validator(ids: unknown[]) {
          return new Set(ids.map((x) => String(x))).size === ids.length
        },
        message: 'likes must be unique user ids',
      },
    },
    status: { type: String, enum: ['active', 'hidden', 'reported'], default: 'active' },
  },
  { timestamps: true }
)

reviewSchema.index({ tmdbMovieId: 1, createdAt: -1 })
reviewSchema.index({ userId: 1, tmdbMovieId: 1 }, { unique: true })

export const ReviewModel = models.Review || model('Review', reviewSchema)