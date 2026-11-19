import type { ReactNode } from 'react';
import { useFocusOnMount } from './useFocusOnMount';

type WorkspacePageProps = {
  title: string;
  aboveTitle?: ReactNode;
  subtitle?: ReactNode;
  headingAction?: ReactNode;
  focusHeading?: boolean;
  children: ReactNode;
};

/** Shared heading rhythm and route-entry focus for workspace destinations. */
export function WorkspacePage({
  title,
  aboveTitle,
  subtitle,
  headingAction,
  focusHeading = true,
  children,
}: Readonly<WorkspacePageProps>) {
  const headingFocus = useFocusOnMount<HTMLHeadingElement>(focusHeading);
  const heading = (
    <h1
      {...headingFocus}
      className="min-w-0 text-title font-extrabold tracking-tight wrap-anywhere outline-none lg:text-title-lg"
    >
      {title}
    </h1>
  );
  return (
    <section>
      {aboveTitle}
      <div
        className={`mb-4 flex flex-wrap justify-between gap-x-3 gap-y-2 sm:mb-8 ${subtitle ? 'items-end' : 'items-center'}`}
      >
        {subtitle ? (
          <div className="min-w-0">
            {heading}
            <p className="mt-1 text-support text-muted">{subtitle}</p>
          </div>
        ) : (
          heading
        )}
        {headingAction}
      </div>
      {children}
    </section>
  );
}
