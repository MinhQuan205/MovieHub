import { randomBytes } from 'node:crypto'
import { Schema, model, models } from 'mongoose'

function createShareSlug(): string {
  return randomBytes(8).toString('base64url').slice(0, 10)
}

const movieItemSchema = new Schema(
  {
    tmdbId: { type: Number, required: true },
    tmdbTitle: { type: String, required: true, trim: true, maxlength: 300 },
    posterPath: { type: String, trim: true },
    addedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
)

const watchlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    isPublic: { type: Boolean, default: false },
    shareSlug: { type: String, required: true, default: createShareSlug },
    movies: { type: [movieItemSchema], default: [] },
  },
  { timestamps: true }
)

watchlistSchema.index({ userId: 1 })
watchlistSchema.index({ shareSlug: 1 }, { unique: true })
watchlistSchema.index({ userId: 1, 'movies.tmdbId': 1 })

export const WatchlistModel = models.Watchlist || model('Watchlist', watchlistSchema)