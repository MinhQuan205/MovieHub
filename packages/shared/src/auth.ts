export type AuthProvider = "local" | "google" | "facebook";

export type UserRole = "user" | "moderator" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  provider: AuthProvider;
  role: UserRole;
  isVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType?: "Bearer";
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName: string;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ResetPasswordRequest = {
  token: string;
  newPassword: string;
};

export type AuthSession = {
  user: AuthUser;
  tokens: AuthTokens;
};

export type RefreshTokenResponse = {
  accessToken: string;
  expiresIn: number;
  tokenType?: "Bearer";
};
