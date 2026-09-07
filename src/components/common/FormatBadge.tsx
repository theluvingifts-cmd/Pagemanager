import React from 'react';
import { ContentFormat } from '../../types/content';
import { FORMAT_CONFIG } from '../../utils/constants';
import { FileText, Film, Sparkles, Images, Video } from 'lucide-react';

interface FormatBadgeProps {
  format: ContentFormat;
  className?: string;
  showIcon?: boolean;
}

export const FormatBadge: React.FC<FormatBadgeProps> = ({
  format,
  className = '',
  showIcon = true,
}) => {
  const config = FORMAT_CONFIG[format] || FORMAT_CONFIG.post;

  const renderIcon = () => {
    const iconClass = 'w-3.5 h-3.5 shrink-0 text-slate-500';
    switch (format) {
      case 'reel':
        return <Film className={iconClass} />;
      case 'story':
        return <Sparkles className={iconClass} />;
      case 'album':
        return <Images className={iconClass} />;
      case 'video':
        return <Video className={iconClass} />;
      case 'post':
      default:
        return <FileText className={iconClass} />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap ${className}`}
    >
      {showIcon && renderIcon()}
      <span>{config.label}</span>
    </span>
  );
};
