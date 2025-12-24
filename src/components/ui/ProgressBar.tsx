// ProgressBar Component - Visual progress indicator

export interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProgressBar({
  progress,
  label,
  showPercentage = true,
  variant = 'default',
  size = 'md',
  className = ''
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  const heightStyles = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  const colorStyles = {
    default: 'bg-[var(--color-primary)]',
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    error: 'bg-[var(--color-error)]'
  };

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-2 text-sm">
          {label && (
            <span className="text-[var(--color-text-secondary)]">{label}</span>
          )}
          {showPercentage && (
            <span className="font-medium text-[var(--color-text)]">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`
          w-full bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden
          ${heightStyles[size]}
        `}
      >
        <div
          className={`
            ${heightStyles[size]} ${colorStyles[variant]}
            rounded-full transition-all duration-300 ease-out
          `}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
