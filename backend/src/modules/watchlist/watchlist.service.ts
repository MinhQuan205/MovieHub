import type { Types } from 'mongoose'
import { WatchlistModel } from '../../models/Watchlist.model'
import { getSocketServer } from '../../sockets/socket.server'
import {
  WATCHLIST_SOCKET_EVENTS,
  type WatchlistCreatedPayload,
  type WatchlistDeletedPayload,
  type WatchlistMovieAddedPayload,
  type WatchlistMovieRemovedPayload,
  type WatchlistSnapshot,
  type WatchlistUpdatedPayload,
} from '../../sockets/watchlist.socket'
import { AppError } from '../../utils/AppError'

export interface CreateWatchlistDto {
  name: string
  isPublic?: boolean
}

export interface UpdateWatchlistDto {
  name?: string
  isPublic?: boolean
}

export interface WatchlistMovieDto {
  tmdbId: number
  tmdbTitle: string
  posterPath?: string
  note?: string
}

export interface WatchlistDto {
  id: string
  userId: string
  name: string
  isPublic: boolean
  shareSlug: string
  movieCount: number
  createdAt: Date
  updatedAt: Date
}

type WatchlistLeanDoc = {
  _id: Types.ObjectId
  userId: Types.ObjectId
  name: string
  isPublic: boolean
  shareSlug: string
  movies: Array<{ tmdbId: number; addedAt?: Date }>
  createdAt: Date
  updatedAt: Date
}

type WatchlistEmitPayloadMap = {
  [WATCHLIST_SOCKET_EVENTS.CREATED]: WatchlistCreatedPayload
  [WATCHLIST_SOCKET_EVENTS.UPDATED]: WatchlistUpdatedPayload
  [WATCHLIST_SOCKET_EVENTS.DELETED]: WatchlistDeletedPayload
  [WATCHLIST_SOCKET_EVENTS.ADDED]: WatchlistMovieAddedPayload
  [WATCHLIST_SOCKET_EVENTS.REMOVED]: WatchlistMovieRemovedPayload
}

type WatchlistMovieToAdd = WatchlistMovieDto & {
  addedAt: Date
}

async function findOwnedWatchlist(watchlistId: string, userId: string): Promise<WatchlistLeanDoc> {
  const watchlist = await WatchlistModel.findById(watchlistId).lean<WatchlistLeanDoc>()

  if (!watchlist) {
    throw new AppError('Watchlist not found', 404, 'WATCHLIST_NOT_FOUND')
  }

  if (watchlist.userId.toString() !== userId) {
    throw new AppError('You do not have permission to access this watchlist', 403, 'FORBIDDEN')
  }

  return watchlist
}

function toDto(doc: WatchlistLeanDoc): WatchlistDto {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    name: doc.name,
    isPublic: doc.isPublic,
    shareSlug: doc.shareSlug,
    movieCount: doc.movies.length,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function toSocketSnapshot(watchlist: WatchlistDto): WatchlistSnapshot {
  return {
    ...watchlist,
    createdAt: watchlist.createdAt.toISOString(),
    updatedAt: watchlist.updatedAt.toISOString(),
  }
}

function emitWatchlistEvent(
  userId: string,
  event: typeof WATCHLIST_SOCKET_EVENTS.CREATED,
  payload: WatchlistCreatedPayload
): void
function emitWatchlistEvent(
  userId: string,
  event: typeof WATCHLIST_SOCKET_EVENTS.UPDATED,
  payload: WatchlistUpdatedPayload
): void
function emitWatchlistEvent(
  userId: string,
  event: typeof WATCHLIST_SOCKET_EVENTS.DELETED,
  payload: WatchlistDeletedPayload
): void
function emitWatchlistEvent(
  userId: string,
  event: typeof WATCHLIST_SOCKET_EVENTS.ADDED,
  payload: WatchlistMovieAddedPayload
): void
function emitWatchlistEvent(
  userId: string,
  event: typeof WATCHLIST_SOCKET_EVENTS.REMOVED,
  payload: WatchlistMovieRemovedPayload
): void
function emitWatchlistEvent(
  userId: string,
  event: keyof WatchlistEmitPayloadMap,
  payload: WatchlistEmitPayloadMap[keyof WatchlistEmitPayloadMap]
): void {
  const socketServer = getSocketServer()
  if (!socketServer) return

  switch (event) {
    case WATCHLIST_SOCKET_EVENTS.CREATED:
      socketServer.to(userId).emit(event, payload as WatchlistCreatedPayload)
      break
    case WATCHLIST_SOCKET_EVENTS.UPDATED:
      socketServer.to(userId).emit(event, payload as WatchlistUpdatedPayload)
      break
    case WATCHLIST_SOCKET_EVENTS.DELETED:
      socketServer.to(userId).emit(event, payload as WatchlistDeletedPayload)
      break
    case WATCHLIST_SOCKET_EVENTS.ADDED:
      socketServer.to(userId).emit(event, payload as WatchlistMovieAddedPayload)
      break
    case WATCHLIST_SOCKET_EVENTS.REMOVED:
      socketServer.to(userId).emit(event, payload as WatchlistMovieRemovedPayload)
      break
  }

  console.log(`[SOCKET] ${event} → user ${userId}`)
}

export async function getUserWatchlists(userId: string): Promise<WatchlistDto[]> {
  const docs = await WatchlistModel.find({ userId })
    .sort({ createdAt: -1 })
    .lean<WatchlistLeanDoc[]>()

  return docs.map(toDto)
}

export async function createWatchlist(
  userId: string,
  dto: CreateWatchlistDto
): Promise<WatchlistDto> {
  const doc = await WatchlistModel.create({
    userId,
    name: dto.name,
    isPublic: dto.isPublic ?? false,
  })

  const lean = await WatchlistModel.findById(doc._id).lean<WatchlistLeanDoc>()
  if (!lean) throw new AppError('Watchlist creation failed', 500, 'INTERNAL_ERROR')

  const watchlist = toDto(lean)

  emitWatchlistEvent(userId, WATCHLIST_SOCKET_EVENTS.CREATED, {
    watchlistId: watchlist.id,
    action: 'created',
    watchlist: toSocketSnapshot(watchlist),
  })

  return watchlist
}

export async function updateWatchlist(
  watchlistId: string,
  userId: string,
  dto: UpdateWatchlistDto
): Promise<WatchlistDto> {
  await findOwnedWatchlist(watchlistId, userId)

  const updated = await WatchlistModel.findByIdAndUpdate(
    watchlistId,
    { $set: dto },
    { returnDocument: 'after', runValidators: true }
  ).lean<WatchlistLeanDoc>()

  if (!updated) throw new AppError('Watchlist not found after update', 404, 'WATCHLIST_NOT_FOUND')

  const watchlist = toDto(updated)

  emitWatchlistEvent(userId, WATCHLIST_SOCKET_EVENTS.UPDATED, {
    watchlistId,
    action: 'updated',
    watchlist: toSocketSnapshot(watchlist),
  })

  return watchlist
}

export async function deleteWatchlist(watchlistId: string, userId: string): Promise<void> {
  await findOwnedWatchlist(watchlistId, userId)

  const deleted = await WatchlistModel.findByIdAndDelete(watchlistId).lean<WatchlistLeanDoc>()
  if (!deleted) throw new AppError('Watchlist not found after delete', 404, 'WATCHLIST_NOT_FOUND')

  emitWatchlistEvent(userId, WATCHLIST_SOCKET_EVENTS.DELETED, {
    watchlistId,
    action: 'deleted',
  })
}

export async function addMovieToWatchlist(
  watchlistId: string,
  userId: string,
  movie: WatchlistMovieDto
): Promise<WatchlistDto> {
  const watchlist = await findOwnedWatchlist(watchlistId, userId)

  if (watchlist.movies.some((item) => item.tmdbId === movie.tmdbId)) {
    throw new AppError('Movie already exists in watchlist', 409, 'WATCHLIST_MOVIE_EXISTS')
  }

  const addedAt = new Date()
  const movieToAdd: WatchlistMovieToAdd = {
    tmdbId: movie.tmdbId,
    tmdbTitle: movie.tmdbTitle,
    addedAt,
  }

  if (typeof movie.posterPath === 'string') {
    movieToAdd.posterPath = movie.posterPath
  }

  if (typeof movie.note === 'string') {
    movieToAdd.note = movie.note
  }

  const updated = await WatchlistModel.findOneAndUpdate(
    {
      _id: watchlistId,
      userId,
      'movies.tmdbId': { $ne: movie.tmdbId },
    },
    { $push: { movies: movieToAdd } },
    { returnDocument: 'after', runValidators: true }
  ).lean<WatchlistLeanDoc>()

  if (!updated) {
    throw new AppError('Movie already exists in watchlist', 409, 'WATCHLIST_MOVIE_EXISTS')
  }

  const payload: WatchlistMovieAddedPayload = {
    watchlistId,
    action: 'added',
    movie: {
      tmdbId: movie.tmdbId,
      addedAt: addedAt.toISOString(),
    },
  }

  emitWatchlistEvent(userId, WATCHLIST_SOCKET_EVENTS.ADDED, payload)

  return toDto(updated)
}

export async function removeMovieFromWatchlist(
  watchlistId: string,
  userId: string,
  tmdbId: number
): Promise<WatchlistDto> {
  const watchlist = await findOwnedWatchlist(watchlistId, userId)

  if (!watchlist.movies.some((item) => item.tmdbId === tmdbId)) {
    return toDto(watchlist)
  }

  const updated = await WatchlistModel.findByIdAndUpdate(
    watchlistId,
    { $pull: { movies: { tmdbId } } },
    { returnDocument: 'after', runValidators: true }
  ).lean<WatchlistLeanDoc>()

  if (!updated) throw new AppError('Watchlist not found after update', 404, 'WATCHLIST_NOT_FOUND')

  const payload: WatchlistMovieRemovedPayload = {
    watchlistId,
    action: 'removed',
    movie: {
      tmdbId,
    },
  }

  emitWatchlistEvent(userId, WATCHLIST_SOCKET_EVENTS.REMOVED, payload)

  return toDto(updated)
}
