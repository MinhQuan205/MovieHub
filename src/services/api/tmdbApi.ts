import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// LƯU Ý: Thay thế 'YOUR_TMDB_API_KEY' bằng API Key thật của bạn
const TMDB_API_KEY = '7ee750ce1f68e671ca5964574e89110e';

// Base URL trỏ vào Backend cục bộ (10.0.2.2 là localhost của Android Emulator)
const BACKEND_URL = 'http://10.0.2.2:4000/api/v1';

export const tmdbApi = createApi({
  reducerPath: 'tmdbApi',
  baseQuery: fetchBaseQuery({ baseUrl: BACKEND_URL }),
  endpoints: (builder) => ({
    // ─── ENDPOINTS GỌI VỀ BACKEND ──────────────────────────────────────────
    getTrending: builder.query<any, void>({
      query: () => `/movies/trending?window=day`,
      transformResponse: (res: any) => res.data,
    }),
    getPopular: builder.query<any, void>({
      query: () => `/movies/popular?page=1`,
      transformResponse: (res: any) => res.data,
    }),
    getMovieDetail: builder.query<any, number>({
      query: (id) => `/movies/${id}`,
      transformResponse: (res: any) => res.data,
    }),
    searchMovies: builder.query<any, { query: string; page: number }>({
      query: (arg) => `/search?q=${encodeURIComponent(arg.query)}&page=${arg.page}`,
      transformResponse: (res: any) => res.data,
    }),
    getMoviesByGenre: builder.query<any, { genreIds: string; page: number }>({
      query: (arg) => `/discover?genre=${arg.genreIds}&page=${arg.page}`,
      transformResponse: (res: any) => res.data,
    }),
    
    // ─── ENDPOINTS TV SERIES (Tạm thời vẫn gọi thẳng TMDB vì Backend chưa hỗ trợ TV) ───
    getTvDetail: builder.query<any, number>({
      query: (id) => `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos,similar`,
    }),
    getTvByGenre: builder.query<any, { genreIds: string; page: number }>({
      query: (arg) => `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&with_genres=${arg.genreIds}&page=${arg.page}`,
    }),
  }),
});

export const { 
  useGetTrendingQuery, 
  useGetPopularQuery, 
  useGetMovieDetailQuery, 
  useSearchMoviesQuery, 
  useGetMoviesByGenreQuery,
  useGetTvDetailQuery,
  useGetTvByGenreQuery
} = tmdbApi;
