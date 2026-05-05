import React from 'react';
import { clsx } from 'clsx';

interface Props {
  lifecycle: string;
  className?: string;
  style?: React.CSSProperties;
}

export const LifecycleBadge = ({ lifecycle, className, style }: Props) => {
  const lc = lifecycle?.toLowerCase() || 'discovery';
  
  return (
    <span 
      className={clsx(
        'badge',
        `badge-${lc}`,
        className
      )}
      style={style}
    >
      {lifecycle || 'Discovery'}
    </span>
  );
};
