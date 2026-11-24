import type { ReactNode } from 'react';

type PlaceholderKind = 'collection' | 'rows' | 'preview' | 'study' | 'today';

export function LoadingStatus({ children, className = '' }: Readonly<{ children: ReactNode; className?: string }>) {
  return <output className={`loading-status ${className}`}>{children}</output>;
}

export function LoadingPlaceholder({
  children,
  kind,
  className = '',
  blue = false,
  stack = false,
}: Readonly<{ children: ReactNode; kind: PlaceholderKind; className?: string; blue?: boolean; stack?: boolean }>) {
  return (
    <div
      className={`loading-placeholder ${className}`}
      data-loading-shape={kind}
      data-loading-blue={blue || undefined}
      data-loading-stack={stack || undefined}
    >
      {kind === 'collection' && <div className="loading-field" aria-hidden="true" />}
      {kind === 'today' && (
        <div className="loading-card loading-week" aria-hidden="true">
          <span className="loading-bar" />
          <div className="loading-week-days">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        </div>
      )}
      <div className="loading-card loading-content">
        {(kind === 'collection' || kind === 'preview') && <span className="loading-icon" aria-hidden="true" />}
        {kind === 'study' && <span className="loading-bar" aria-hidden="true" />}
        <LoadingStatus>{children}</LoadingStatus>
        {kind === 'rows' && <div className="loading-rows" aria-hidden="true" />}
      </div>
      {(kind === 'collection' || kind === 'preview') && (
        <div className="loading-card loading-companion" aria-hidden="true">
          <span className="loading-bar" />
        </div>
      )}
      {kind === 'study' && <div className="loading-field" aria-hidden="true" />}
    </div>
  );
}
