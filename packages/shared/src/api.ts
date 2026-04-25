export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | string;

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiMeta = {
  requestId?: string;
  timestamp?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

export type ApiSuccess<T> = {
  data: T;
  message?: string;
  meta?: ApiMeta;
};

export type ApiFailure = {
  error: ApiError;
  message?: string;
  meta?: ApiMeta;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
