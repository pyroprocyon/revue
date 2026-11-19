import { ChevronLeft, ChevronRight } from 'lucide-react';
import { secondaryButton } from './buttonStyles';

type PageControlsProps = {
  label: string;
  className?: string;
  compact?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
};

const pageButton = `${secondaryButton} disabled:bg-subtle disabled:text-muted disabled:shadow-none`;
const compactButton =
  'pressable inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 px-2 text-support font-semibold text-accent sm:px-3 disabled:cursor-default disabled:bg-subtle disabled:text-muted/70';

export function PageControls({
  label,
  className = 'mt-6 justify-between',
  compact = false,
  onPrevious,
  onNext,
}: Readonly<PageControlsProps>) {
  const layout = compact
    ? 'inline-flex shrink-0 rounded-control border border-line bg-surface'
    : 'flex flex-wrap gap-3';
  const labelClass = compact ? 'max-sm:sr-only' : undefined;
  return (
    <nav aria-label={label} className={`${layout} ${className}`}>
      <button
        type="button"
        className={compact ? `${compactButton} rounded-l-control` : pageButton}
        onClick={onPrevious}
        disabled={!onPrevious}
      >
        {compact && <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />}
        <span className={labelClass}>Previous</span>
      </button>
      <button
        type="button"
        className={compact ? `${compactButton} rounded-r-control border-l border-line` : pageButton}
        onClick={onNext}
        disabled={!onNext}
      >
        <span className={labelClass}>Next</span>
        {compact && <ChevronRight aria-hidden="true" className="size-4 shrink-0" />}
      </button>
    </nav>
  );
}
