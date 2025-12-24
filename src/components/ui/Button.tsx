// Button Component - shadcn/ui style with CSS animations

import { type ComponentChildren } from 'preact';
import { cn } from '@/lib/utils';

export interface ButtonProps {
  children: ComponentChildren;
  variant?: 'default' | 'primary' | 'ghost' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
  className = ''
}: ButtonProps) {
  const baseStyles = cn(
    'inline-flex items-center justify-center gap-2',
    'font-medium rounded-lg',
    'transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none',
    'active:scale-95',
    fullWidth && 'w-full'
  );

  const variants = {
    default: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)]',
    primary: 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 shadow-[0_0_20px_rgba(40,229,24,0.3)] hover:shadow-[0_0_30px_rgba(40,229,24,0.5)]',
    ghost: 'hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]',
    outline: 'border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)]',
    destructive: 'bg-[var(--color-error)] text-white hover:opacity-90'
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
    icon: 'h-10 w-10'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
    >
      {loading && (
        <span className="spinner" style={{ width: '1rem', height: '1rem' }} />
      )}
      {children}
    </button>
  );
}
