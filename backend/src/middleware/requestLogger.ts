import morgan from 'morgan'

export const requestLogger = morgan('combined', {
  skip: (req) => req.url?.includes('/health') ?? false,
})
