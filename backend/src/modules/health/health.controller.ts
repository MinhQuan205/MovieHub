import { Request, Response } from 'express'
import { config } from '../../config'
import { isDatabaseConnected } from '../../config/database'
import { apiResponse } from '../../utils/apiResponse'
import { isRedisConnected } from '../../config/redis'

export function getHealth(req: Request, res: Response): void {
    const redisConnected = isRedisConnected()
    const mongoConnected = isDatabaseConnected()
    const strictReadiness = config.health.strictReadiness
    const dependenciesReady = redisConnected && mongoConnected
    const isReady = !strictReadiness || dependenciesReady

    const status: 'ok' | 'degraded' | 'down' = dependenciesReady ? 'ok' : strictReadiness ? 'down' : 'degraded'
    const httpStatus = isReady ? 200 : 503

    res.status(httpStatus).json(
        apiResponse.success(
            {
                service: 'Movihub-backend',
                status,
                readiness: isReady ? 'ready' : 'not-ready',
                timestamp: new Date().toISOString(),
                dependencies: {
                    mongodb: mongoConnected ? 'connected' : 'disconnected',
                    redis: redisConnected ? 'connected' : 'disconnected',
                },
            },
            isReady ? 'OK' : 'DEPENDENCY_UNAVAILABLE'
        )
    )
}
