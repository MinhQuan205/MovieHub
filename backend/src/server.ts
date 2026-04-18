import app from './app'
import { config } from './config'
import { connectDatabase } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'

let server: ReturnType<typeof app.listen> | null = null
let shuttingDown = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`Received ${signal}, shutting down...`)

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve())
    })
  }

  await disconnectRedis()
  process.exit(0)
}

async function bootstrap() {
  await connectDatabase()
  await connectRedis()

  server = app.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}${config.apiPrefix}/health`)
  })
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  void disconnectRedis()
  process.exit(1)
})
