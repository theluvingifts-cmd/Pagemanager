export type ContentStatus = 
  | 'draft'        // Bản nháp
  | 'ready'        // Sẵn sàng đăng
  | 'scheduled'    // Đã lên lịch
  | 'publishing'   // Đang xuất bản lên Facebook
  | 'published'    // Đã đăng thành công
  | 'failed';      // Lỗi xuất bản

export type ContentFormat = 
  | 'text'         // Bài viết văn bản
  | 'photo'        // Bài viết kèm hình ảnh
  | 'link'         // Bài viết kèm liên kết
  | 'video';       // Bài viết video

export type ContentPillar = 
  | 'sales'        // Bán hàng
  | 'branding'     // Branding
  | 'feedback'     // Feedback
  | 'value'        // Chia sẻ giá trị
  | 'engagement'   // Tương tác
  | 'campaign';    // Chiến dịch

export interface MediaItem {
  id?: string;
  url: string;
  name: string;
  type: 'image' | 'video';
  size?: string;
  storage_path?: string;
  uploadedAt?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  caption: string; // Nội dung bài viết (message gửi lên Facebook)
  message?: string; // alias
  link?: string | null;
  pillar?: ContentPillar;
  format?: ContentFormat;
  content_type?: string;
  status: ContentStatus;
  media: MediaItem[];
  source?: 'pagemanager' | 'facebook';
  scheduledAt?: string;
  scheduled_at?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  pageId?: string;
  facebook_page_id?: string;
  facebook_post_id?: string;
  facebook_permalink?: string;
  facebook_created_time?: string;
  publish_error?: string;
  facebook_page?: {
    id: string;
    page_id: string;
    page_name: string;
    page_avatar_url?: string;
  };
  metrics?: {
    reach?: number;
    engagement?: number;
    clicks?: number;
    shares?: number;
    comments?: number;
  };
}

export interface PageProfile {
  id: string;
  page_id?: string;
  name: string;
  username?: string;
  avatar: string;
  fanCount?: number;
  statusText?: string;
  isConnected?: boolean;
}
