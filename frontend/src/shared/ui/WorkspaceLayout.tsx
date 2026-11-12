import type { ReactNode } from 'react';
import { PageLayout } from './PageLayout';

type WorkspaceLayoutProps = {
  brand: ReactNode;
  navigation?: ReactNode;
  children: ReactNode;
};

/** Feature routes supply working destinations; the workspace owns width and navigation placement. */
export function WorkspaceLayout({ brand, navigation, children }: Readonly<WorkspaceLayoutProps>) {
  return (
    <div className="[--container-page:var(--container-wide)]">
      <PageLayout top={<>
        {brand}
        {navigation && <nav aria-label="Workspace" className="flex w-full flex-wrap gap-2 border-b border-line pb-3 sm:ml-auto sm:w-auto sm:border-0 sm:pb-0">
          {navigation}
        </nav>}
      </>}>
        <div className="py-6 sm:py-8">{children}</div>
      </PageLayout>
    </div>
  );
}
