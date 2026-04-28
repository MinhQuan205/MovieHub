import { createLogger, format, transports } from 'winston'

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'moviehub-backend' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : ''
          return `${String(timestamp)} [${level}]: ${String(message)}${metaStr}`
        })
      ),
    }),
  ],
})

export default logger
