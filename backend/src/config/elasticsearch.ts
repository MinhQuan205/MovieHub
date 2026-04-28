import { Client } from '@elastic/elasticsearch'
import { config } from './index'
import logger from '../utils/logger'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 5
const BASE_DELAY_MS = 1_000   // 1 s — doubles each attempt (exponential back-off)
const PING_TIMEOUT_MS = 5_000 // how long to wait for a health ping

// ─────────────────────────────────────────────────────────────
// Singleton state
// ─────────────────────────────────────────────────────────────

let esClient: Client | null = null
let connected = false

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Build the Elasticsearch Client from config.
 * Auth is only attached when ELASTICSEARCH_USERNAME / PASSWORD are set.
 */
function buildClient(): Client {
  const node = config.elasticsearch.url

  const clientOptions: ConstructorParameters<typeof Client>[0] = {
    node,
    requestTimeout: 10_000,
    // Compress request bodies — useful when indexing large movie documents
    compression: true,
    // The official client retries on network errors automatically;
    // our own retry loop handles connection failures at startup.
    maxRetries: 1,
  }

  // Optional Basic Auth (for Elasticsearch in production / Elastic Cloud)
  if (config.elasticsearch.username && config.elasticsearch.password) {
    clientOptions.auth = {
      username: config.elasticsearch.username,
      password: config.elasticsearch.password,
    }
  }

  // Optional API Key Auth (Elastic Cloud preferred method)
  if (config.elasticsearch.apiKey) {
    clientOptions.auth = {
      apiKey: config.elasticsearch.apiKey,
    }
  }

  return new Client(clientOptions)
}

// ─────────────────────────────────────────────────────────────
// Connect — with exponential back-off retry
// ─────────────────────────────────────────────────────────────

/**
 * Initialise the Elasticsearch singleton.
 *
 * - Pings the cluster to confirm connectivity.
 * - Retries up to MAX_RETRIES times with exponential back-off.
 * - In non-production envs, a missing ELASTICSEARCH_URL is treated
 *   as a soft failure (logs a warning and continues without ES).
 * - In production a failed connection after all retries throws,
 *   causing the bootstrap to abort.
 */
export async function connectElasticsearch(): Promise<void> {
  if (connected && esClient) {
    return
  }

  if (!config.elasticsearch.url) {
    if (config.nodeEnv === 'production') {
      throw new Error('ELASTICSEARCH_URL is required in production environment')
    }

    logger.warn('ELASTICSEARCH_URL is not set — Elasticsearch disabled (non-production mode)')
    return
  }

  esClient = buildClient()

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await esClient.ping({}, { requestTimeout: PING_TIMEOUT_MS })
      connected = true
      logger.info('Elasticsearch connected', { node: config.elasticsearch.url })
      return
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`Elasticsearch connection attempt ${attempt}/${MAX_RETRIES} failed: ${message}`)

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) // 1s, 2s, 4s, 8s …
        logger.info(`Retrying Elasticsearch connection in ${delay}ms…`)
        await sleep(delay)
      }
    }
  }

  // All retries exhausted
  const finalMessage =
    lastError instanceof Error ? lastError.message : String(lastError)

  if (config.nodeEnv === 'production') {
    throw new Error(`Elasticsearch connection failed after ${MAX_RETRIES} attempts: ${finalMessage}`)
  }

  // Non-production: continue without ES (search will be degraded / disabled)
  logger.warn(
    `Elasticsearch unavailable after ${MAX_RETRIES} attempts — continuing without search (non-production)`
  )
  esClient = null
}

// ─────────────────────────────────────────────────────────────
// Disconnect — clean shutdown
// ─────────────────────────────────────────────────────────────

export async function disconnectElasticsearch(): Promise<void> {
  if (!esClient) return

  try {
    await esClient.close()
    logger.info('Elasticsearch disconnected')
  } catch (err) {
    logger.warn('Error while closing Elasticsearch client', { err })
  } finally {
    esClient = null
    connected = false
  }
}

// ─────────────────────────────────────────────────────────────
// Getters
// ─────────────────────────────────────────────────────────────

/**
 * Returns the active Elasticsearch Client.
 * Throws if called before a successful `connectElasticsearch()`.
 */
export function getElasticsearchClient(): Client {
  if (!esClient || !connected) {
    throw new Error('Elasticsearch client is not ready. Call connectElasticsearch() first.')
  }
  return esClient
}

/**
 * Safe connectivity check — never throws.
 * Use this guard before any search / index operation.
 */
export function isElasticsearchConnected(): boolean {
  return connected && esClient !== null
}

// ─────────────────────────────────────────────────────────────
// Health check — ping with timeout
// ─────────────────────────────────────────────────────────────

/**
 * Performs a live ping and returns detailed cluster information.
 * Intended for use by the /health/readiness endpoint.
 */
export async function elasticsearchHealthCheck(): Promise<{
  status: 'ok' | 'unreachable' | 'disabled'
  node: string
  latencyMs?: number
}> {
  if (!esClient) {
    return { status: 'disabled', node: config.elasticsearch.url ?? '(not configured)' }
  }

  const start = Date.now()

  try {
    await esClient.ping({}, { requestTimeout: PING_TIMEOUT_MS })
    return {
      status: 'ok',
      node: config.elasticsearch.url,
      latencyMs: Date.now() - start,
    }
  } catch {
    connected = false
    return {
      status: 'unreachable',
      node: config.elasticsearch.url,
      latencyMs: Date.now() - start,
    }
  }
}
