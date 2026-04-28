export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface PaginationQuery {
  page?: string;
  limit?: string;
}

interface ParsedPagination {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Parse pagination parameters from URL query strings.
 * Defaults: page=1, limit=20. Constraints: page >= 1, limit <= 100.
 */
export function parsePagination(query: PaginationQuery): ParsedPagination {
  let page = Number(query.page) || 1;
  let limit = Number(query.limit) || 20;

  page = Math.max(page, 1);
  limit = Math.min(Math.max(limit, 1), 100);

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build pagination metadata for API responses.
 */
export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
