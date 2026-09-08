import { REPLY_FORMULA_OPTIONS, STATUS_OPTIONS } from './constants';
import type { ContactStatus, ReplyFormulaMode } from './types';

export const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat('vi-VN', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
  ).format(date);
};

export const formatSize = (size?: number | null) => {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

export const statusLabel = (value?: ContactStatus) => STATUS_OPTIONS.find(item => item.value === value)?.label || 'Khách mới';
export const replyFormulaLabel = (mode?: ReplyFormulaMode) => REPLY_FORMULA_OPTIONS.find(item => item.value === (mode || 'inherit'))?.label || 'Theo cài đặt shop';

export const renderTemplate = (text: string, name?: string, page?: string) => String(text || '')
  .replace(/{{\s*name\s*}}/gi, name || 'bạn')
  .replace(/{{\s*page\s*}}/gi, page || 'shop');

export const previewLastMessage = (text?: string | null, attachmentType?: string | null) => {
  if (text) return text;
  if (!attachmentType) return 'Tin nhắn';
  if (attachmentType === 'image') return '[Ảnh]';
  if (attachmentType === 'video') return '[Video]';
  if (attachmentType === 'audio') return '[Audio]';
  return '[Tệp đính kèm]';
};
