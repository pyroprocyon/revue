import type { ReactNode } from 'react';
import { useFocusOnMount } from './useFocusOnMount';

type WorkspacePageProps = {
  title?: string;
  className?: string;
  headingId?: string;
  headingIcon?: ReactNode;
  aboveTitle?: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  headingAction?: ReactNode;
  headerControls?: ReactNode;
  focusHeading?: boolean;
  children: ReactNode;
};

/** Shared heading rhythm and route-entry focus for workspace destinations. */
export function WorkspacePage({
  title,
  className = '',
  headingId,
  headingIcon,
  aboveTitle,
  subtitle,
  status,
  headingAction,
  headerControls,
  focusHeading = true,
  children,
}: Readonly<WorkspacePageProps>) {
  const headingFocus = useFocusOnMount<HTMLHeadingElement>(focusHeading);
  const heading = (
    <h1
      {...headingFocus}
      id={headingId}
      className={`min-w-0 text-title font-extrabold tracking-tight wrap-anywhere outline-none lg:text-title-lg ${headingIcon ? 'flex items-center gap-3' : ''}`}
    >
      {headingIcon}
      {headingIcon ? <span className="min-w-0 wrap-anywhere">{title}</span> : title}
    </h1>
  );
  return (
    <section className={`workspace-page ${className}`}>
      {(title !== undefined || aboveTitle || headerControls) && (
        <div className="workspace-page-header">
          {aboveTitle}
          {title !== undefined && (
            <div
              className={`workspace-titlebar mb-4 flex flex-wrap justify-between gap-x-3 gap-y-2 sm:mb-8 ${subtitle ? 'items-end' : 'items-center'}`}
            >
              {subtitle ? (
                <div className="min-w-0">
                  {heading}
                  <p className="mt-1 text-support text-muted">{subtitle}</p>
                  {status && <div className="mt-2">{status}</div>}
                </div>
              ) : (
                heading
              )}
              {headingAction}
            </div>
          )}
          {headerControls}
        </div>
      )}
      {children}
    </section>
  );
}
