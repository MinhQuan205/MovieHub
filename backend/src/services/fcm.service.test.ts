jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: {
    messaging: jest.fn(),
  },
}))

jest.mock('../config/firebase', () => ({
  getFirebaseAdmin: jest.fn(),
}))

jest.mock('../models/User.model', () => ({
  UserModel: {
    updateOne: jest.fn(),
    findById: jest.fn(),
  },
}))

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import admin from 'firebase-admin'
import { getFirebaseAdmin } from '../config/firebase'
import { UserModel } from '../models/User.model'
import { FcmPayloadValidationError, sendToDevice } from './fcm.service'

const mockedMessaging = admin.messaging as jest.Mock
const mockedGetFirebaseAdmin = getFirebaseAdmin as jest.MockedFunction<typeof getFirebaseAdmin>
const mockedUpdateOne = UserModel.updateOne as jest.Mock

describe('fcmService.sendToDevice', () => {
  let sendEachForMulticast: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    sendEachForMulticast = jest.fn(async (message) => ({
      successCount: message.tokens.length - (message.tokens.includes('token-499') ? 2 : 0),
      failureCount: message.tokens.includes('token-499') ? 2 : 0,
      responses: message.tokens.map((token: string) => {
        if (token === 'token-0') {
          return { success: false, error: { code: 'messaging/invalid-argument' } }
        }
        if (token === 'token-499') {
          return { success: false, error: { code: 'messaging/invalid-registration-token' } }
        }
        return { success: true }
      }),
    }))

    mockedGetFirebaseAdmin.mockReturnValue({} as ReturnType<typeof getFirebaseAdmin>)
    mockedMessaging.mockReturnValue({ sendEachForMulticast })
    mockedUpdateOne.mockResolvedValue({ modifiedCount: 1 })
  })

  it('chunks tokens into FCM batches and prunes only the failed token mapped by response index', async () => {
    const tokens = Array.from({ length: 501 }, (_, index) => `token-${index}`)

    await sendToDevice('user-1', tokens, { title: 'Hello', body: 'World' })

    const batchSizes = sendEachForMulticast.mock.calls
      .map(([message]) => message.tokens.length)
      .sort((a, b) => a - b)

    expect(batchSizes).toEqual([1, 500])
    expect(mockedUpdateOne).toHaveBeenCalledTimes(1)
    expect(mockedUpdateOne).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $pull: { fcmTokens: { $in: ['token-499'] } } }
    )
  })

  it('rejects oversized payloads before calling Firebase Messaging', async () => {
    await expect(
      sendToDevice('user-1', ['token-1'], { title: 'Hello', body: 'x'.repeat(5000) })
    ).rejects.toBeInstanceOf(FcmPayloadValidationError)

    expect(mockedMessaging).not.toHaveBeenCalled()
    expect(sendEachForMulticast).not.toHaveBeenCalled()
    expect(mockedUpdateOne).not.toHaveBeenCalled()
  })
})
