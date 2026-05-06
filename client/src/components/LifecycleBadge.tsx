import React from 'react';
import { clsx } from 'clsx';

interface Props {
  lifecycle: string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const LifecycleBadge = ({ lifecycle, color, className, style }: Props) => {
  const lc = lifecycle?.toLowerCase() || 'discovery';
  
  return (
    <span 
      className={clsx(
        'badge',
        !color && `badge-${lc}`, // fallback to old CSS classes if no color provided
        className
      )}
      style={{
        ...style,
        backgroundColor: color || undefined,
        color: color ? 'white' : undefined,
        textShadow: color ? '0 1px 2px rgba(0,0,0,0.3)' : undefined
      }}
    >
      {lifecycle || 'Discovery'}
    </span>
  );
};
