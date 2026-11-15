import type { ReactNode } from 'react';
import { useFocusOnMount } from './useFocusOnMount';

/** Shared heading rhythm and route-entry focus for workspace destinations. */
export function WorkspacePage({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  const headingFocus = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section>
      <h1
        {...headingFocus}
        className="mb-6 text-title font-extrabold tracking-tight outline-none sm:mb-8 lg:text-title-lg"
      >
        {title}
      </h1>
      {children}
    </section>
  );
}
