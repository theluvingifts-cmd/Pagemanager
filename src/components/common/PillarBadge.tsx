import React from 'react';
import { ContentPillar } from '../../types/content';
import { PILLAR_CONFIG } from '../../utils/constants';

interface PillarBadgeProps {
  pillar: ContentPillar;
  className?: string;
}

export const PillarBadge: React.FC<PillarBadgeProps> = ({ pillar, className = '' }) => {
  const config = PILLAR_CONFIG[pillar] || PILLAR_CONFIG.sales;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {config.label}
    </span>
  );
};
