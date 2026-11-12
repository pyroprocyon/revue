import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from './LayoutParts';

/** Focused practice fills a phone when content fits, and grows with long or enlarged text. */
export function StudyLayout({ top, children }: Readonly<{ top: ReactNode; children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col px-1 sm:pt-4 lg:px-2 lg:pt-4">
      <SkipToContent />
      <header className={`${readingColumn} flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 pt-[env(safe-area-inset-top)]`}>{top}</header>
      <main id="main-content" tabIndex={-1}
        className={`${readingColumn} flex flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:flex-none`}>
        {children}
      </main>
    </div>
  );
}
