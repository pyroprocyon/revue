import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from './LayoutParts';

/** Focused practice fills a phone when content fits, and grows with long or enlarged text. */
export function StudyLayout({ top, children }: Readonly<{ top: ReactNode; children: ReactNode }>) {
  const column = `${readingColumn} workspace-review-column`;
  return (
    <div className="study-layout workspace-container flex min-h-[var(--page-height)] flex-col [--container-page:42rem]">
      <SkipToContent />
      <header
        className={`${column} phone-page-header flex shrink-0 flex-wrap items-center gap-x-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pb-4`}
      >
        {top}
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={`${column} flex flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:flex-none`}
      >
        {children}
      </main>
    </div>
  );
}
