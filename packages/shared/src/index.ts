export * from "./api";
export * from "./auth";
export * from "./movie";
export * from "./watchlist";
export * from "./review";

// Legacy aliases to avoid breaking existing imports.
export type Movie = import("./movie").MovieSummary;
export type WatchlistItem = import("./watchlist").WatchlistMovieItem;
