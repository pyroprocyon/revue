import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from '../../shared/ui/LayoutParts';

/** The public hero alone owns the compact phone footer and wide desktop composition. */
export function LandingLayout({ top, actions, children }: Readonly<{ top: ReactNode; actions: ReactNode; children: ReactNode }>) {
  const column = `${readingColumn} lg:max-w-wide`;
  return (
    <div className="@container/landing">
      <div className="landing-screen flex h-dvh flex-col px-1 lg:h-auto lg:min-h-dvh lg:px-2 lg:pt-4">
        <SkipToContent />
        <header className={`${column} flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 pt-[env(safe-area-inset-top)]`}>{top}</header>
        <main id="main-content"
          tabIndex={0 /* NOSONAR S6845: this scroll container needs focus for native keyboard scrolling. */}
          className="min-h-[min(16rem,50dvh)] flex-1 scroll-smooth overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:flex-none lg:overflow-visible">
          <div className={`${column} flex min-h-full flex-col pb-[max(1rem,env(safe-area-inset-bottom))]`}>{children}</div>
        </main>
        <div className="shrink-0 bg-page shadow-actions lg:hidden">
          <div className={`${column} pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]`}>{actions}</div>
        </div>
      </div>
    </div>
  );
}
