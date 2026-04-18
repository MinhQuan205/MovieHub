import { UserModel } from './User.model'
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './testDb'

jest.setTimeout(60000)

describe('UserModel integration', () => {
  beforeAll(async () => {
    await connectTestDatabase()
    await UserModel.init()
  })

  afterEach(async () => {
    await clearTestDatabase()
  })

  afterAll(async () => {
    await disconnectTestDatabase()
  })

  it('enforces unique email', async () => {
    await UserModel.create({
      email: 'duplicate@example.com',
      passwordHash: 'password123',
      displayName: 'User A',
      provider: 'local',
    })

    await expect(
      UserModel.create({
        email: 'duplicate@example.com',
        passwordHash: 'password456',
        displayName: 'User B',
        provider: 'local',
      })
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('requires passwordHash for local provider', async () => {
    await expect(
      UserModel.create({
        email: 'local@example.com',
        displayName: 'Local User',
        provider: 'local',
      })
    ).rejects.toThrow()
  })

  it('requires providerId for google provider', async () => {
    await expect(
      UserModel.create({
        email: 'google@example.com',
        displayName: 'Google User',
        provider: 'google',
      })
    ).rejects.toThrow()
  })

  it('validates fcmTokens are unique per user', async () => {
    await expect(
      UserModel.create({
        email: 'tokens@example.com',
        passwordHash: 'password123',
        displayName: 'Token User',
        provider: 'local',
        fcmTokens: ['token-a', 'token-a'],
      })
    ).rejects.toThrow('fcmTokens must be unique')
  })
})
