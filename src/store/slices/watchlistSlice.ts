import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface WatchlistState {
  movies: any[];
}

const initialState: WatchlistState = {
  movies: [],
};

export const watchlistSlice = createSlice({
  name: 'watchlist',
  initialState,
  reducers: {
    toggleWatchlist: (state, action: PayloadAction<any>) => {
      const movie = action.payload;
      const exists = state.movies.find((m) => m.id === movie.id);
      if (exists) {
        state.movies = state.movies.filter((m) => m.id !== movie.id); // Bỏ khỏi list nếu đã có
      } else {
        state.movies.push(movie); // Thêm vào list nếu chưa có
      }
    },
  },
});

export const { toggleWatchlist } = watchlistSlice.actions;
export default watchlistSlice.reducer;
