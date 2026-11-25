import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from './LayoutParts';

/** Focused practice fills a phone when content fits, and grows with long or enlarged text. */
export function StudyLayout({ top, children }: Readonly<{ top: ReactNode; children: ReactNode }>) {
  return (
    <div className="workspace-container">
      <div className="study-layout flex min-h-[var(--page-height)] flex-col">
        <SkipToContent />
        <header
          className={`${readingColumn} phone-page-header flex shrink-0 flex-wrap items-center gap-x-3 pt-[max(0.75rem,var(--reading-header-inset))] sm:pb-4`}
        >
          {top}
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`${readingColumn} flex flex-1 flex-col pb-[max(1rem,var(--phone-bottom-inset))] outline-none sm:flex-none`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
