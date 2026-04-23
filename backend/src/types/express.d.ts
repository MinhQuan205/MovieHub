export {}

declare global {
  namespace Express {
    interface UserPreferences {
      language: 'vi' | 'en'
      theme: 'light' | 'dark' | 'system'
      favoriteGenres: number[]
    }

    interface User {
      id: string
      role: 'user' | 'admin'
      email: string
      isEmailVerified: boolean
      displayName: string
      preferences: UserPreferences
      jti?: string
      exp?: number
      userId?: string
    }
  }
}
