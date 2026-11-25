import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from '../../shared/ui/LayoutParts';

/** The public hero alone owns the compact phone footer and wide desktop composition. */
export function LandingLayout({
  top,
  actions,
  children,
}: Readonly<{ top: ReactNode; actions: ReactNode; children: ReactNode }>) {
  return (
    <div className="@container/landing">
      <div className="landing-screen flex h-[var(--page-height)] flex-col lg:h-auto lg:min-h-[var(--page-height)] lg:pt-4">
        <SkipToContent />
        <header
          className={`${readingColumn} flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 pt-[var(--reading-header-inset)]`}
        >
          {top}
        </header>
        <main
          id="main-content"
          tabIndex={0 /* NOSONAR S6845: this scroll container needs focus for native keyboard scrolling. */}
          className="min-h-[min(16rem,50dvh)] flex-1 scroll-smooth overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:flex-none lg:overflow-visible"
        >
          <div className={`${readingColumn} flex min-h-full flex-col pb-[max(1rem,var(--phone-bottom-inset))]`}>
            {children}
          </div>
        </main>
        <div className={`${readingColumn} shrink-0 pt-3 pb-[max(1rem,var(--phone-bottom-inset))] lg:hidden`}>
          <div className="floating-control-surface rounded-card border border-line p-2.5">{actions}</div>
        </div>
      </div>
    </div>
  );
}
