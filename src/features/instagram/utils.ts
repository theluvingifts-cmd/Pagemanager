import { InstagramAccount, InstagramConversation, InstagramMediaItem, InstagramParticipant } from './types';

export const formatCompactNumber = (value?: number) => {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1)}K`;
  return String(number);
};

export const formatInstagramDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const getMediaPreview = (item?: InstagramMediaItem | null) => item?.thumbnail_url || item?.media_url || item?.children?.data?.[0]?.thumbnail_url || item?.children?.data?.[0]?.media_url || '';

export const getConversationCustomer = (conversation: InstagramConversation, account?: InstagramAccount | null): InstagramParticipant | null => {
  const participants = conversation.participants?.data || [];
  if (!participants.length) return null;
  const other = participants.find(p => p.id !== account?.id && p.username !== account?.username);
  return other || participants[0] || null;
};

export const getConversationPreview = (conversation: InstagramConversation) => {
  const message = conversation.messages?.data?.[0];
  if (!message) return 'Chưa có nội dung';
  if (message.message) return message.message;
  if (message.attachments?.data?.length) return '[Tệp đính kèm]';
  return 'Tin nhắn Instagram';
};
