export type StoryStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
export interface StoryItem {
  id: string; title: string; caption: string; mediaUrl: string; mediaType: 'image' | 'video';
  platforms: Array<'facebook' | 'instagram'>; status: StoryStatus; scheduledAt?: string | null;
  pageName?: string; publishError?: string | null; createdAt: string; publishedAt?: string | null;
}
export interface StoryRecommendation {
  title: string; objective: string; visual: string; overlayText: string; cta: string; bestTime: string; reason: string;
}
