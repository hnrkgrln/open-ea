import React from 'react';
import { clsx } from 'clsx';
import { getContrastColor } from '../utils/colors';

interface Props {
  lifecycle: string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const LifecycleBadge = ({ lifecycle, color, className, style }: Props) => {
  const lc = lifecycle?.toLowerCase() || 'discovery';
  const textColor = color ? getContrastColor(color) : undefined;
  
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
        color: textColor,
        textShadow: color && textColor === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.3)' : undefined,
        border: color && textColor === '#000000' ? '1px solid rgba(0,0,0,0.15)' : undefined
      }}
    >
      {lifecycle || 'Discovery'}
    </span>
  );
};
