import type { ReactNode } from 'react';
import { readingColumn, SkipToContent } from './LayoutParts';

type PageLayoutProps = {
  top: ReactNode;
  actions?: ReactNode;
  pinActionsOnPhone?: boolean;
  children: ReactNode;
};

/** Reading and browsing use document scrolling, with actions following their content. */
export function PageLayout({ top, actions, pinActionsOnPhone = false, children }: Readonly<PageLayoutProps>) {
  const page = (
    <div className={`min-h-dvh px-1 sm:pt-4 lg:px-2 ${pinActionsOnPhone ? 'page-with-phone-actions' : ''}`}>
      <SkipToContent />
      <header className={`${readingColumn} flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pt-[env(safe-area-inset-top)]`}>
        {top}
      </header>
      <main id="main-content" tabIndex={-1} className={`${readingColumn} @container flex flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none`}>
        {children}
        {!pinActionsOnPhone && actions && <div className="pt-3">{actions}</div>}
      </main>
      {pinActionsOnPhone && actions && (
        <footer className="shrink-0 bg-page">
          <div className={`${readingColumn} pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]`}>{actions}</div>
        </footer>
      )}
    </div>
  );
  return pinActionsOnPhone ? <div className="@container/page-actions">{page}</div> : page;
}
