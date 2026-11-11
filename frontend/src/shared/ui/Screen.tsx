import type { ReactNode } from 'react';

type ScreenProps = {
  top: ReactNode;
  actions?: ReactNode;
  /** The landing page keeps its desktop call to action inside the page instead. */
  actionsOnPhonesOnly?: boolean;
  wide?: boolean;
  children: ReactNode;
};

/**
 * One phone-height screen: a top bar, the content, and the actions pinned at the bottom, so the
 * main action is never below the fold. Content longer than the screen, such as the landing page,
 * a long card or text enlarged to 200%, scrolls in the middle and is never cut off. The middle
 * retains a usable minimum height even when enlarged actions need page scrolling. Short viewports
 * use ordinary page scrolling. Reading and study pages also use page scrolling from 640 pixels;
 * the landing page keeps its phone composition until its desktop layout starts at 1024 pixels.
 */
export function Screen({ top, actions, actionsOnPhonesOnly = false, wide = false, children }: Readonly<ScreenProps>) {
  const column = `mx-auto w-full max-w-page pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] ${wide ? 'lg:max-w-wide' : ''}`;
  const pageLayout = wide ? 'lg:h-auto lg:min-h-dvh' : 'sm:h-auto sm:min-h-dvh sm:pt-4';
  const contentLayout = wide ? 'lg:flex-none lg:overflow-visible' : 'sm:flex-none sm:overflow-visible';
  return (
    <div className={`app-screen flex h-dvh flex-col px-1 lg:px-2 lg:pt-4 ${pageLayout}`}>
      <header className={`${column} flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 pt-[env(safe-area-inset-top)]`}>
        {top}
      </header>
      <main
        tabIndex={0 /* NOSONAR S6845: this scroll container needs focus for native keyboard scrolling. */}
        className={`focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent min-h-[min(16rem,50dvh)] flex-1 scroll-smooth overflow-y-auto overscroll-contain ${contentLayout}`}>
        <div className={`${column} flex min-h-full flex-col pb-[max(1rem,env(safe-area-inset-bottom))]`}>{children}</div>
      </main>
      {actions && (
        <div className={`shrink-0 bg-page shadow-actions ${wide ? 'lg:shadow-none' : 'sm:shadow-none'} ${actionsOnPhonesOnly ? 'lg:hidden' : ''}`}>
          <div className={`${column} pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]`}>{actions}</div>
        </div>
      )}
    </div>
  );
}

/** Full-width stacked buttons on phones, side by side from 640 pixels. */
export function ActionRow({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">{children}</div>;
}
