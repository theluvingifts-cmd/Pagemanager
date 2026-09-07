export type ContentStatus =
  | 'draft'
  | 'ready'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

export type ContentType = 'text' | 'photo' | 'link' | 'video';

export interface Profile {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  created_at: string;
}

export interface FacebookPage {
  id: string; // internal UUID
  page_id: string; // Facebook Graph Page ID
  page_name: string;
  page_username?: string;
  page_avatar_url?: string;
  page_tasks?: string[];
  is_active?: boolean;
  connected_at?: string;
  updated_at?: string;
  isConnected?: boolean;
}

export interface MediaItem {
  id?: string;
  content_id?: string;
  storage_path?: string;
  public_url: string;
  media_type: 'image' | 'video';
  file_name?: string;
  file_size?: number;
  created_at?: string;
}

export interface ContentItem {
  id: string;
  user_id: string;
  facebook_page_id?: string | null;
  title: string;
  message: string;
  link?: string | null;
  content_type: ContentType;
  status: ContentStatus;
  source: 'pagemanager' | 'facebook';
  scheduled_at?: string | null;
  facebook_post_id?: string | null;
  facebook_permalink?: string | null;
  facebook_created_time?: string | null;
  publish_error?: string | null;
  created_at: string;
  updated_at: string;
  facebook_page?: {
    id: string;
    page_id: string;
    page_name: string;
    page_avatar_url?: string;
  };
  media?: MediaItem[];
}

export interface SystemConfigStatus {
  status: string;
  appName: string;
  metaConfigured: boolean;
  firebaseConfigured: boolean;
  metaAppId?: string | null;
  appUrl?: string | null;
  redirectUri: string;
}
