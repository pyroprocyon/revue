import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from './LayoutParts';

type PageLayoutProps = {
  top: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

/** Reading and browsing use document scrolling, with actions following their content. */
export function PageLayout({ top, actions, children }: Readonly<PageLayoutProps>) {
  return (
    <div className="min-h-dvh px-1 sm:pt-4 lg:px-2">
      <SkipToContent />
      <header className={`${readingColumn} flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 pt-[env(safe-area-inset-top)]`}>
        {top}
      </header>
      <main id="main-content" tabIndex={-1} className={`${readingColumn} @container flex flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none`}>
        {children}
        {actions && <div className="pt-3">{actions}</div>}
      </main>
    </div>
  );
}
