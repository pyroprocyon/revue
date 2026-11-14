import type { ReactNode } from 'react';
import { useFocusOnMount } from './useFocusOnMount';

/** Shared heading rhythm and route-entry focus for workspace destinations. */
export function WorkspacePage({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section>
      <h1 ref={heading} tabIndex={-1} className="mb-6 text-title font-extrabold tracking-tight outline-none sm:mb-8 lg:text-title-lg">{title}</h1>
      {children}
    </section>
  );
}
