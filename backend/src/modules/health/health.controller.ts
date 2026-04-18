import { Request, Response } from 'express'
import { config } from '../../config'
import { apiResponse } from '../../utils/apiResponse'
import { isRedisConnected } from '../../config/redis'

export function getHealth(req: Request, res: Response): void {
    const redisConnected = isRedisConnected()
    const strictReadiness = config.health.strictReadiness
    const isReady = !strictReadiness || redisConnected

    const status: 'ok' | 'degraded' | 'down' = redisConnected ? 'ok' : strictReadiness ? 'down' : 'degraded'
    const httpStatus = isReady ? 200 : 503

    res.status(httpStatus).json(
        apiResponse.success(
            {
                service: 'Movihub-backend',
                status,
                readiness: isReady ? 'ready' : 'not-ready',
                timestamp: new Date().toISOString(),
                dependencies: {
                    redis: redisConnected ? 'connected' : 'disconnected',
                },
            },
            isReady ? 'OK' : 'DEPENDENCY_UNAVAILABLE'
        )
    )
}
