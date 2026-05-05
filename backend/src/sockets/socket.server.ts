import type { Server as HttpServer } from 'node:http'
import { Server, Socket } from 'socket.io'
import { config } from '../config'
import { verifyAccessToken } from '../utils/jwt'
import logger from '../utils/logger'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from './watchlist.socket'

export type MovieHubSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

type MovieHubSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

type SocketAuth = {
  token?: unknown
}

export let io: MovieHubSocketServer | null = null

function authenticateSocket(socket: MovieHubSocket, next: (err?: Error) => void): void {
  const auth = socket.handshake.auth as SocketAuth
  const token = typeof auth.token === 'string' ? auth.token : null

  if (!token) {
    next(new Error('Unauthorized'))
    return
  }

  try {
    const payload = verifyAccessToken(token)
    socket.data.user = { id: payload.sub }
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
}

export function initializeSocketServer(httpServer: HttpServer): MovieHubSocketServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: config.cors.origins.length > 0 ? config.cors.origins : true,
        credentials: true,
      },
    }
  )

  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    const userId = socket.data.user.id

    socket.join(userId)
    logger.info('Socket connected', { socketId: socket.id, userId })

    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { socketId: socket.id, userId, reason })
    })
  })

  return io
}

export function getSocketServer(): MovieHubSocketServer | null {
  return io
}
