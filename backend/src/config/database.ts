import mongoose from 'mongoose'
import { config } from './index'

let listenersRegistered = false

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function registerConnectionListeners(): void {
    if (listenersRegistered) return

    mongoose.connection.on('connected', () => {
        console.log('MongoDB connected')
    })

    mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected')
    })

    mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected')
    })

    mongoose.connection.on('error', (err: Error) => {
        console.error('MongoDB error:', err.message)
    })

    listenersRegistered = true
}

export async function connectDatabase(): Promise<void> {
    registerConnectionListeners()

    if (!config.mongoUri) {
        if (config.health.strictReadiness) {
            throw new Error('MONGODB_URI is required when strict readiness is enabled')
        }

        console.warn('MONGODB_URI is missing, skip DB connection in local skeleton mode')
        return
    }

    if (mongoose.connection.readyState === 1) return

    let lastError: unknown

    for (let attempt = 1; attempt <= config.database.connectRetries; attempt += 1) {
        try {
            await mongoose.connect(config.mongoUri)
            return
        } catch (err) {
            lastError = err
            const message = err instanceof Error ? err.message : String(err)
            console.error(`MongoDB connection attempt ${attempt} failed: ${message}`)

            if (attempt < config.database.connectRetries) {
                await sleep(config.database.connectRetryDelayMs)
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error('MongoDB connection failed')
}

export async function disconnectDatabase(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect()
    }
}

export function isDatabaseConnected(): boolean {
    return mongoose.connection.readyState === 1
}
