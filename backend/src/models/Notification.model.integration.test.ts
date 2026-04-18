import mongoose from 'mongoose'
import { NotificationModel } from './Notification.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './testDb'

jest.setTimeout(60000)

describe('NotificationModel integration', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await NotificationModel.init()
  })

  afterEach(async () => {
    await clearTestDatabase()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('validates notification type enum', async () => {
    await expect(
      NotificationModel.create({
        userId: new mongoose.Types.ObjectId(),
        type: 'invalid_type',
        title: 'Title',
        body: 'Body',
      })
    ).rejects.toThrow()
  })

  it('defines TTL index for createdAt (30 days)', () => {
    const indexes = NotificationModel.schema.indexes()
    const ttlIndex = indexes.find((index: [Record<string, number>, Record<string, unknown>]) => {
      const fields = index[0] as Record<string, number>
      const options = index[1] as { expireAfterSeconds?: number }

      return fields.createdAt === 1 && options.expireAfterSeconds === 60 * 60 * 24 * 30
    })

    expect(ttlIndex).toBeDefined()
  })
})
