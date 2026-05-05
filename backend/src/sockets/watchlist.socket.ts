export const WATCHLIST_SOCKET_EVENTS = {
  CREATED: 'watchlist:created',
  UPDATED: 'watchlist:updated',
  DELETED: 'watchlist:deleted',
  ADDED: 'watchlist:added',
  REMOVED: 'watchlist:removed',
} as const

export const REVIEW_SOCKET_EVENTS = {
  LIKED: 'review:liked',
} as const

export type WatchlistSocketEvent =
  (typeof WATCHLIST_SOCKET_EVENTS)[keyof typeof WATCHLIST_SOCKET_EVENTS]

export type ReviewSocketEvent =
  (typeof REVIEW_SOCKET_EVENTS)[keyof typeof REVIEW_SOCKET_EVENTS]

export interface WatchlistSnapshot {
  id: string
  userId: string
  name: string
  isPublic: boolean
  shareSlug: string
  movieCount: number
  createdAt: string
  updatedAt: string
}

export interface WatchlistCreatedPayload {
  watchlistId: string
  action: 'created'
  watchlist: WatchlistSnapshot
}

export interface WatchlistUpdatedPayload {
  watchlistId: string
  action: 'updated'
  watchlist: WatchlistSnapshot
}

export interface WatchlistDeletedPayload {
  watchlistId: string
  action: 'deleted'
}

export interface WatchlistMovieAddedPayload {
  watchlistId: string
  action: 'added'
  movie: {
    tmdbId: number
    addedAt: string
  }
}

export interface WatchlistMovieRemovedPayload {
  watchlistId: string
  action: 'removed'
  movie: {
    tmdbId: number
  }
}

export interface ReviewLikedPayload {
  reviewId: string
  userId: string
  action: 'liked' | 'unliked'
  totalLikes: number
}

export interface ServerToClientEvents {
  [WATCHLIST_SOCKET_EVENTS.CREATED]: (payload: WatchlistCreatedPayload) => void
  [WATCHLIST_SOCKET_EVENTS.UPDATED]: (payload: WatchlistUpdatedPayload) => void
  [WATCHLIST_SOCKET_EVENTS.DELETED]: (payload: WatchlistDeletedPayload) => void
  [WATCHLIST_SOCKET_EVENTS.ADDED]: (payload: WatchlistMovieAddedPayload) => void
  [WATCHLIST_SOCKET_EVENTS.REMOVED]: (payload: WatchlistMovieRemovedPayload) => void
  [REVIEW_SOCKET_EVENTS.LIKED]: (payload: ReviewLikedPayload) => void
}

export interface ClientToServerEvents {
  noop: () => void
}

export interface InterServerEvents {
  ping: () => void
}

export interface SocketUser {
  id: string
}

export interface SocketData {
  user: SocketUser
}
