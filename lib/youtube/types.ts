export interface CategoryDTO {
  id: string;
  name: string;
  color: string;
  order: number;
  channelCount: number;
}

export interface ChannelDTO {
  id: string;
  channelId: string;
  channelName: string;
  channelThumbnail: string | null;
  categoryId: string | null;
  addedAt: string;
}

export interface VideoDTO {
  id: string;
  videoId: string;
  channelId: string;
  channelName: string;
  channelThumbnail: string | null;
  categoryId: string | null;
  title: string;
  thumbnail: string | null;
  publishedAt: string;
  duration: string | null;
  watched: boolean;
  saved: boolean;
}

export const CATEGORY_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#f97316",
];
