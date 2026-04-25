export type MovieGenre = {
  id: number;
  name: string;
};

export type CastMember = {
  id: number;
  name: string;
  character?: string;
  profilePath?: string;
  order?: number;
};

export type CrewMember = {
  id: number;
  name: string;
  job: string;
  department?: string;
  profilePath?: string;
};

export type MovieSummary = {
  id: number;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
  voteCount?: number;
  releaseDate?: string;
  releaseYear?: string;
  genres?: MovieGenre[];
};

export type MovieDetail = MovieSummary & {
  runtime?: number;
  status?: string;
  originalLanguage?: string;
  budget?: number;
  revenue?: number;
  trailerUrl?: string;
  cast?: CastMember[];
  crew?: CrewMember[];
  similarMovies?: MovieSummary[];
};

export type MovieSearchFilters = {
  query?: string;
  genreIds?: number[];
  year?: number;
  minRating?: number;
  maxRating?: number;
  page?: number;
};

export type HomeSectionsResponse<TMovie = MovieSummary> = {
  trendingMovies: TMovie[];
  nowPlayingMovies: TMovie[];
  upcomingMovies: TMovie[];
};
