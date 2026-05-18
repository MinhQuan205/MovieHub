import { configureStore } from '@reduxjs/toolkit';
import { tmdbApi } from '../services/api/tmdbApi';
import watchlistReducer from './slices/watchlistSlice';
import authReducer from './slices/authSlice';

export const store = configureStore({
  reducer: {
    [tmdbApi.reducerPath]: tmdbApi.reducer,
    watchlist: watchlistReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(tmdbApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
