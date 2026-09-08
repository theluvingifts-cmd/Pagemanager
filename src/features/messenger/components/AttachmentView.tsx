import React from 'react';
import { ExternalLink, File as FileIcon, FileAudio, FileImage, FileVideo } from 'lucide-react';
import type { Attachment } from '../types';
import { formatSize } from '../utils';

export const AttachmentView: React.FC<{ attachment: Attachment; onImage: (url: string) => void }> = ({ attachment, onImage }) => {
  const url = attachment.url || attachment.previewUrl || '';
  if (attachment.type === 'image' && url) {
    return (
      <button type="button" onClick={() => onImage(url)} className="block mt-1 overflow-hidden rounded-lg border border-black/5 bg-slate-100 max-w-[360px]">
        <img src={attachment.previewUrl || url} alt={attachment.name || 'Ảnh Messenger'} className="block max-h-80 w-auto max-w-full object-contain" />
      </button>
    );
  }
  if (attachment.type === 'video' && url) return <video src={url} controls preload="metadata" className="mt-1 max-h-80 max-w-[380px] rounded-lg bg-black" />;
  if (attachment.type === 'audio' && url) return <audio src={url} controls preload="metadata" className="mt-1 max-w-[340px]" />;
  if (!url) return null;

  const Icon = attachment.type === 'video' ? FileVideo : attachment.type === 'audio' ? FileAudio : attachment.type === 'image' ? FileImage : FileIcon;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 text-[10px] text-slate-700 hover:bg-slate-50 max-w-[340px]">
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
      <div className="min-w-0">
        <p className="font-bold truncate">{attachment.name || 'Tệp đính kèm'}</p>
        <p className="text-[9px] text-slate-400">{attachment.mimeType || attachment.type}{attachment.size ? ` · ${formatSize(attachment.size)}` : ''}</p>
      </div>
      <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
    </a>
  );
};
