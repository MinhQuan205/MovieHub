import { tmdbService } from '../../services/tmdb.service'
import type {
  TMDBMovieList,
  TMDBMovieDetail,
  TMDBGenre,
} from '@shared/types/movie.types'

// ─────────────────────────────────────────────────────────────
// Local types for service layer params
// ─────────────────────────────────────────────────────────────

/** Accepted values for trending time window */
export type TrendingWindow = 'day' | 'week'

/** Accepted list types routed to the correct TMDB endpoint */
export type MovieListType =
  | 'trending'
  | 'now_playing'
  | 'popular'
  | 'top_rated'
  | 'upcoming'

/** Params forwarded to TMDB /discover/movie */
export interface DiscoverParams {
  genre?: string    // TMDB genre ID(s) as comma-separated string
  year?: number
  rating?: number   // Minimum vote_average
  sort?: string     // e.g. 'popularity.desc'
  page?: number
}

// ─────────────────────────────────────────────────────────────
// MoviesService — wrapper over TMDBService
// Pure data logic. Never touches req / res.
// ─────────────────────────────────────────────────────────────

export class MoviesService {
  /**
   * Fetches one of the named movie lists from TMDB.
   * - 'trending'    → getTrending(window, page)
   * - 'now_playing' → getNowPlaying(page)
   * - 'popular'     → getPopular(page)
   * - 'top_rated'   → getTopRated(page)
   * - 'upcoming'    → getUpcoming(page)
   */
  async getMovieLists(
    type: MovieListType,
    page = 1,
    window: TrendingWindow = 'day'
  ): Promise<TMDBMovieList> {
    switch (type) {
      case 'trending':
        return tmdbService.getTrending(window, page)
      case 'now_playing':
        return tmdbService.getNowPlaying(page)
      case 'popular':
        return tmdbService.getPopular(page)
      case 'top_rated':
        return tmdbService.getTopRated(page)
      case 'upcoming':
        return tmdbService.getUpcoming(page)
    }
  }

  /**
   * Fetches full movie detail including credits, videos, similar, etc.
   * Post-processed by TMDBService (trailer + director fields added).
   */
  async getMovieDetail(id: number): Promise<TMDBMovieDetail> {
    return tmdbService.getMovieDetail(id)
  }

  /**
   * Fetches a list of movies similar to the given movie ID.
   */
  async getSimilar(id: number): Promise<TMDBMovieList> {
    return tmdbService.getMovieSimilar(id)
  }

  /**
   * Fetches the full list of TMDB movie genres.
   */
  async getGenres(): Promise<TMDBGenre[]> {
    return tmdbService.getGenres()
  }

  /**
   * Fetches movies via TMDB discover endpoint with optional filters.
   * Maps our own DiscoverParams to DiscoverMovieParams expected by TMDBService.
   */
  async discover(params: DiscoverParams): Promise<TMDBMovieList> {
    return tmdbService.discoverMovies({
      // Conditional spread avoids assigning `undefined` to optional keys
      // (required by exactOptionalPropertyTypes: true)
      ...(params.genre !== undefined && { genre: Number(params.genre) }),
      ...(params.year !== undefined && { year: params.year }),
      ...(params.rating !== undefined && { minRating: params.rating }),
      ...(params.sort !== undefined && { sortBy: params.sort }),
      ...(params.page !== undefined && { page: params.page }),
    })
  }
}

export const moviesService = new MoviesService()
