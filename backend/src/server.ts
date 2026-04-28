import app from './app'
import { config } from './config'
import { connectDatabase, disconnectDatabase } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'
import { connectElasticsearch, disconnectElasticsearch } from './config/elasticsearch'

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
  await disconnectElasticsearch()
  await disconnectDatabase()
  process.exit(0)
}

async function bootstrap() {
  await connectDatabase()
  await connectRedis()
  await connectElasticsearch()

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
  void Promise.all([disconnectRedis(), disconnectElasticsearch(), disconnectDatabase()])
  process.exit(1)
})
