import type { CRMContactData } from '../crm/types';

export type InstagramTab = 'overview' | 'media' | 'comments' | 'inbox';
export type InstagramCustomerStatus = 'new' | 'interested' | 'quoted' | 'waiting' | 'ordered' | 'delivered' | 'closed';

export interface InstagramCustomerMeta {
  tags: string[];
  note: string;
  starred: boolean;
  status: InstagramCustomerStatus;
  crm: CRMContactData;
  updatedAt?: string | null;
}

export interface InstagramAccount {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
  website?: string;
}

export interface InstagramMediaChild { id: string; media_type?: string; media_url?: string; thumbnail_url?: string; }
export interface InstagramMediaItem {
  id: string; caption?: string; media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string;
  media_product_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string;
  username?: string; like_count?: number; comments_count?: number; children?: { data?: InstagramMediaChild[] };
}
export interface InstagramComment { id: string; text?: string; timestamp?: string; username?: string; like_count?: number; replies?: { data?: InstagramComment[] }; }
export interface InstagramParticipant { id: string; name?: string; username?: string; }
export interface InstagramAttachmentData { image_data?: { url?: string }; video_data?: { url?: string }; file_url?: string; url?: string; mime_type?: string; name?: string; }
export interface InstagramMessage {
  id: string; message?: string; created_time?: string; from?: InstagramParticipant; to?: { data?: InstagramParticipant[] };
  attachments?: { data?: InstagramAttachmentData[] };
}
export interface InstagramConversation {
  id: string;
  updated_time?: string;
  participants?: { data?: InstagramParticipant[] };
  messages?: { data?: InstagramMessage[] };
  customerMeta?: InstagramCustomerMeta;
}
export interface InstagramCacheEntry {
  account: InstagramAccount | null;
  linked: boolean;
  media: InstagramMediaItem[];
  conversations: InstagramConversation[];
  loadedAt: number;
}
