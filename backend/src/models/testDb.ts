import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongoServer: MongoMemoryServer | null = null

export async function connectTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return

  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri())
}

export async function clearTestDatabase(): Promise<void> {
  const collections = Object.values(mongoose.connection.collections)

  await Promise.all(
    collections.map(async (collection) => {
      await collection.deleteMany({})
    })
  )
}

export async function disconnectTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  if (mongoServer) {
    await mongoServer.stop()
    mongoServer = null
  }
}
