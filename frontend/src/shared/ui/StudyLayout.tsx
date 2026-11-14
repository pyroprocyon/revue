import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from './LayoutParts';

/** Focused practice fills a phone when content fits, and grows with long or enlarged text. */
export function StudyLayout({ top, children, wide = false }: Readonly<{ top: ReactNode; children: ReactNode; wide?: boolean }>) {
  const headerLayout = wide
    ? 'workspace-header-gutters mx-auto w-full max-w-[90rem] sm:pb-4'
    : `${readingColumn} min-h-14 pt-[env(safe-area-inset-top)]`;
  return (
    <div className={`flex min-h-dvh flex-col ${wide ? 'workspace-container [--container-page:48rem]' : 'px-1 sm:pt-4 lg:px-2'}`}>
      <SkipToContent />
      <header className={`${headerLayout} flex shrink-0 flex-wrap items-center gap-x-3`}>{top}</header>
      <main id="main-content" tabIndex={-1}
        className={`${readingColumn} flex flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:flex-none`}>
        {children}
      </main>
    </div>
  );
}
