/**
 * notification.processor.test.ts
 *
 * Unit tests for the notification BullMQ processor function.
 * Tests the core job dispatch logic in isolation without actual
 * Redis or Firebase connections.
 */

import type { Job } from 'bullmq'

// ─── Mock FCM service FIRST (before any imports, jest hoists these) ───────────
//
// IMPORTANT: FcmPayloadValidationError must be the SAME class reference used
// by the processor (imported from fcm.service mock) so that `instanceof` checks
// inside the processor work correctly.

const mockSendToUser = jest.fn()

jest.mock('../../services/fcm.service', () => {
  // Define the error class inside the factory so jest.mock hoisting works correctly.
  // The test imports this same class via ProcessorFcmError (line ~84) to ensure
  // instanceof checks inside the processor evaluate to true.
  class _FcmPayloadValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'FcmPayloadValidationError'
    }
  }

  return {
    __esModule: true,
    fcmService: {
      sendToUser: mockSendToUser,
      sendToDevice: jest.fn(),
    },
    FcmPayloadValidationError: _FcmPayloadValidationError,
  }
})

// ─── Mock BullMQ Worker so we can import the processor without Redis ──────────

jest.mock('bullmq', () => ({
  __esModule: true,
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}))

// ─── Mock BullMQ config ───────────────────────────────────────────────────────

const mockGetBullMQConnection = jest.fn()

jest.mock('../../config/bullmq', () => ({
  getBullMQConnection: () => mockGetBullMQConnection(),
  BULLMQ_KEY_PREFIX: 'moviehub:test',
}))

// ─── Mock logger ──────────────────────────────────────────────────────────────
// __esModule: true tells ts-jest this is an ES module default export, so
// `import logger from '../../utils/logger'` resolves to the `default` property.

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

// ─── Import processor AFTER mocks are declared ────────────────────────────────
// jest.mock() calls are hoisted by babel-jest/ts-jest regardless of position,
// but keeping imports below mocks makes the intent clearer.

import {
  startNotificationWorker,
  stopNotificationWorker,
  type NotificationJobData,
} from './notification.processor'

// ─── Grab the FcmPayloadValidationError that the processor actually sees ───────
// This ensures instanceof checks inside processNotificationJob match.
import { FcmPayloadValidationError as ProcessorFcmError } from '../../services/fcm.service'

// ─── Test utilities ───────────────────────────────────────────────────────────

function makeJob(
  name: string,
  data: NotificationJobData,
  overrides: Partial<Pick<Job<NotificationJobData>, 'id' | 'attemptsMade'>> = {}
): Job<NotificationJobData> {
  return {
    id: overrides.id ?? 'test-job-id',
    name,
    data,
    attemptsMade: overrides.attemptsMade ?? 0,
    processedOn: Date.now(),
  } as unknown as Job<NotificationJobData>
}

/** Pull the processor function from the last Worker constructor call args. */
function extractProcessorFn(): (job: Job<NotificationJobData>) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Worker } = jest.requireMock<{ Worker: jest.MockedClass<typeof import('bullmq').Worker> }>('bullmq')
  const fn = Worker.mock.calls.at(-1)?.[1]
  if (!fn) throw new Error('Worker constructor was not called — processorFn not available')
  return fn as (job: Job<NotificationJobData>) => Promise<void>
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationProcessor', () => {

  // Reset singleton before EVERY test to ensure clean state
  beforeEach(async () => {
    await stopNotificationWorker()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await stopNotificationWorker()
  })

  // ── startNotificationWorker ────────────────────────────────────────────────

  describe('startNotificationWorker()', () => {
    it('returns null when BullMQ connection is unavailable', () => {
      mockGetBullMQConnection.mockReturnValue(null)

      const worker = startNotificationWorker()

      expect(worker).toBeNull()
    })

    it('creates and returns a Worker when connection is available', () => {
      mockGetBullMQConnection.mockReturnValue({ status: 'ready' })

      const worker = startNotificationWorker()

      expect(worker).not.toBeNull()
    })

    it('returns the existing singleton on repeated calls', () => {
      mockGetBullMQConnection.mockReturnValue({ status: 'ready' })

      const worker1 = startNotificationWorker()
      const worker2 = startNotificationWorker()

      expect(worker1).toBe(worker2)
    })
  })

  // ── processNotificationJob ─────────────────────────────────────────────────

  describe('processNotificationJob (processor fn)', () => {
    let processorFn: (job: Job<NotificationJobData>) => Promise<void>

    beforeEach(() => {
      // Start a fresh worker — processor fn is captured from Worker mock args
      mockGetBullMQConnection.mockReturnValue({ status: 'ready' })
      startNotificationWorker()
      processorFn = extractProcessorFn()
    })

    it('calls fcmService.sendToUser for push_notification job type', async () => {
      mockSendToUser.mockResolvedValue(undefined)

      const job = makeJob('push_notification', {
        userId: 'user-abc-123',
        title: 'New Movie',
        body: 'Batman is now available!',
      })

      await processorFn(job)

      expect(mockSendToUser).toHaveBeenCalledTimes(1)
      expect(mockSendToUser).toHaveBeenCalledWith('user-abc-123', {
        title: 'New Movie',
        body: 'Batman is now available!',
      })
    })

    it('forwards optional data payload to FCM', async () => {
      mockSendToUser.mockResolvedValue(undefined)

      const job = makeJob('push_notification', {
        userId: 'user-abc-123',
        title: 'Movie Released',
        body: 'Check it out!',
        data: { movieId: '999', type: 'movie_release' },
      })

      await processorFn(job)

      expect(mockSendToUser).toHaveBeenCalledWith('user-abc-123', {
        title: 'Movie Released',
        body: 'Check it out!',
        data: { movieId: '999', type: 'movie_release' },
      })
    })

    it('silently discards unknown job types without throwing', async () => {
      const job = makeJob('unknown_job_type', {
        userId: 'user-abc-123',
        title: 'Test',
        body: 'Test body',
      })

      await expect(processorFn(job)).resolves.toBeUndefined()
      expect(mockSendToUser).not.toHaveBeenCalled()
    })

    it('handles FcmPayloadValidationError gracefully (no rethrow)', async () => {
      // Use the error class as seen by the processor (from the mocked module)
      // so instanceof inside processNotificationJob evaluates to true.
      mockSendToUser.mockRejectedValue(
        new ProcessorFcmError('FCM payload exceeds byte limit')
      )

      const job = makeJob('push_notification', {
        userId: 'user-abc-123',
        title: 'A'.repeat(200),
        body: 'B'.repeat(1000),
      })

      // Non-retryable FCM errors should NOT be rethrown — job is discarded
      await expect(processorFn(job)).resolves.toBeUndefined()
    })

    it('rethrows non-validation FCM errors for BullMQ retry', async () => {
      const networkError = new Error('FCM network timeout')
      mockSendToUser.mockRejectedValue(networkError)

      const job = makeJob('push_notification', {
        userId: 'user-abc-123',
        title: 'Test',
        body: 'Test body',
      })

      // Transient errors SHOULD be rethrown so BullMQ retries the job
      await expect(processorFn(job)).rejects.toThrow('FCM network timeout')
    })
  })

  // ── stopNotificationWorker ─────────────────────────────────────────────────

  describe('stopNotificationWorker()', () => {
    it('resolves without error when no worker is running', async () => {
      await expect(stopNotificationWorker()).resolves.toBeUndefined()
    })

    it('closes the worker gracefully (force=false by default)', async () => {
      mockGetBullMQConnection.mockReturnValue({ status: 'ready' })
      startNotificationWorker()

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Worker } = jest.requireMock<{ Worker: jest.MockedClass<typeof import('bullmq').Worker> }>('bullmq')
      const workerInstance = Worker.mock.results.at(-1)?.value as { close: jest.Mock }

      await stopNotificationWorker()

      expect(workerInstance.close).toHaveBeenCalledWith(false)
    })
  })
})
