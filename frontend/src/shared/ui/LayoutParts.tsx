import type { ReactNode } from 'react';

export const readingColumn = 'page-gutters reading-column mx-auto w-full max-w-page';

export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-control bg-accent px-4 py-3 text-on-accent focus:not-sr-only focus:fixed focus:top-[max(0.5rem,var(--phone-edge-gutter))] focus:left-[max(0.5rem,var(--phone-edge-gutter))] focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
    >
      Skip to content
    </a>
  );
}

/** Full-width stacked buttons on phones, side by side when their labels fit. */
export function ActionRow({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">{children}</div>;
}
