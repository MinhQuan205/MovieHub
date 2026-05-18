import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  users: any[]; // Danh sách tài khoản đã đăng ký
  currentUser: any | null; // Tài khoản đang đăng nhập
}

const initialState: AuthState = {
  users: [],
  currentUser: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    registerUser: (state, action: PayloadAction<any>) => {
      // Thêm user mới vào danh sách
      state.users.push(action.payload);
    },
    loginUser: (state, action: PayloadAction<any>) => {
      state.currentUser = action.payload;
    },
    logoutUser: (state) => {
      state.currentUser = null;
    }
  }
});

export const { registerUser, loginUser, logoutUser } = authSlice.actions;
export default authSlice.reducer;
