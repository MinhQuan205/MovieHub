export type ReviewStatus = "active" | "hidden" | "reported";

export type Review = {
  id: string;
  tmdbId: number;
  userId: string;
  rating: number;
  content: string;
  likesCount: number;
  isLikedByCurrentUser?: boolean;
  status: ReviewStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateReviewRequest = {
  tmdbId: number;
  rating: number;
  content: string;
};

export type UpdateReviewRequest = {
  rating?: number;
  content?: string;
};

export type ReviewSummary = {
  tmdbId: number;
  averageRating: number;
  totalReviews: number;
};
