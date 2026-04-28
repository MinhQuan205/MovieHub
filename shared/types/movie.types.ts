// ─────────────────────────────────────────────────────────────
// Shared TMDB types — used by both backend and mobile
// ─────────────────────────────────────────────────────────────

export interface TMDBMovie {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  popularity: number
  genre_ids: number[]
  original_language: string
  adult: boolean
  video: boolean
  media_type?: 'movie' | 'person' | 'tv'
}

export interface TMDBMovieList {
  page: number
  results: TMDBMovie[]
  total_pages: number
  total_results: number
}

export interface TMDBGenre {
  id: number
  name: string
}

export interface TMDBVideo {
  id: string
  iso_639_1: string
  iso_3166_1: string
  key: string
  name: string
  site: string
  size: number
  type: string
  official: boolean
  published_at: string
}

export interface TMDBCast {
  id: number
  name: string
  original_name: string
  character: string
  profile_path: string | null
  order: number
  known_for_department: string
  gender: number
  popularity: number
  credit_id: string
  cast_id: number
  adult: boolean
}

export interface TMDBCrew {
  id: number
  name: string
  original_name: string
  profile_path: string | null
  department: string
  job: string
  gender: number
  popularity: number
  credit_id: string
  adult: boolean
  known_for_department: string
}

export interface TMDBCredits {
  cast: TMDBCast[]
  crew: TMDBCrew[]
}

export interface TMDBMovieDetail {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  popularity: number
  genres: TMDBGenre[]
  runtime: number | null
  status: string
  tagline: string | null
  budget: number
  revenue: number
  homepage: string | null
  imdb_id: string | null
  original_language: string
  production_companies: Array<{
    id: number
    name: string
    logo_path: string | null
    origin_country: string
  }>
  production_countries: Array<{
    iso_3166_1: string
    name: string
  }>
  spoken_languages: Array<{
    iso_639_1: string
    english_name: string
    name: string
  }>
  adult: boolean
  video: boolean

  // Appended responses
  credits: TMDBCredits
  videos: { results: TMDBVideo[] }
  images: {
    backdrops: Array<{ file_path: string; width: number; height: number }>
    posters: Array<{ file_path: string; width: number; height: number }>
  }
  recommendations: TMDBMovieList
  similar: TMDBMovieList

  // Post-processed fields (added by TMDBService)
  trailer: TMDBVideo | null
  director: TMDBCrew | null
}

export interface TMDBPerson {
  id: number
  name: string
  original_name: string
  biography: string
  birthday: string | null
  deathday: string | null
  gender: number
  known_for_department: string
  place_of_birth: string | null
  popularity: number
  profile_path: string | null
  adult: boolean
  imdb_id: string | null
  homepage: string | null
  also_known_as: string[]
  media_type?: 'movie' | 'person' | 'tv'
}

export interface TMDBPersonCredits {
  id: number
  cast: Array<TMDBMovie & { character: string; credit_id: string }>
  crew: Array<TMDBMovie & { department: string; job: string; credit_id: string }>
}

export interface TMDBConfiguration {
  images: {
    base_url: string
    secure_base_url: string
    backdrop_sizes: string[]
    logo_sizes: string[]
    poster_sizes: string[]
    profile_sizes: string[]
    still_sizes: string[]
  }
  change_keys: string[]
}

export interface DiscoverMovieParams {
  genre?: number
  year?: number
  minRating?: number
  sortBy?: string
  page?: number
  lang?: string
}
