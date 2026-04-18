export {}

declare global {
  namespace Express {
    interface User {
      id: string
      role: 'user' | 'admin'
      email?: string
    }
  }
}
