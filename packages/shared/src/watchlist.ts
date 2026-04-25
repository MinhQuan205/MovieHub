export type WatchlistMovieItem = {
  tmdbId: number;
  addedAt: string;
  note?: string;
};

export type Watchlist = {
  id: string;
  userId: string;
  name: string;
  isPublic: boolean;
  shareSlug?: string;
  movies: WatchlistMovieItem[];
  createdAt?: string;
  updatedAt?: string;
};

export type CreateWatchlistRequest = {
  name: string;
  isPublic?: boolean;
};

export type UpdateWatchlistRequest = {
  name?: string;
  isPublic?: boolean;
};

export type AddMovieToWatchlistRequest = {
  tmdbId: number;
  note?: string;
};

export type RemoveMovieFromWatchlistRequest = {
  tmdbId: number;
};
