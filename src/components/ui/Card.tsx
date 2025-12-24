// Card Component - shadcn/ui style with CSS animations

import { type ComponentChildren } from 'preact';
import { cn } from '@/lib/utils';

export interface CardProps {
  children: ComponentChildren;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function Card({
  children,
  hover = false,
  padding = 'md',
  className = ''
}: CardProps) {
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };

  return (
    <div
      className={cn(
        'bg-[var(--color-bg)] rounded-xl',
        'border border-[var(--color-border)]',
        'shadow-sm transition-all duration-200',
        'animate-fadeIn',
        hover && 'hover:-translate-y-0.5 hover:shadow-lg',
        paddingStyles[padding],
        className
      )}
    >
      {children}
    </div>
  );
}
