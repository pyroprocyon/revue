import type { ReactNode } from 'react';

export const contentGutters = 'pl-[max(var(--spacing-compact-gutter),env(safe-area-inset-left))] pr-[max(var(--spacing-compact-gutter),env(safe-area-inset-right))]';
export const readingColumn = `mx-auto w-full max-w-page ${contentGutters}`;

export function SkipToContent() {
  return <a href="#main-content" className="sr-only rounded-control bg-accent px-4 py-3 text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-accent">Skip to content</a>;
}

/** Full-width stacked buttons on phones, side by side when their labels fit. */
export function ActionRow({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">{children}</div>;
}
