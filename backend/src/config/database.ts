import mongoose from 'mongoose'
import { config } from './index'

export async function connectDatabase(): Promise<void> {
    if (!config.mongoUri) {
        if (config.nodeEnv === 'production') {
            throw new Error('MONGODB_URL is missing in production environment')
        }

        console.warn('MONGODB_URL is missing, skip DB connection in local skeleton mode')
        return
    }

    await mongoose.connect(config.mongoUri)
    console.log('MongoDB connected')
}