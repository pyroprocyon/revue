import type { ReactNode } from 'react';
import { PageLayout } from './PageLayout';

type WorkspaceLayoutProps = {
  brand: ReactNode;
  children: ReactNode;
};

export function WorkspaceLayout({ brand, children }: Readonly<WorkspaceLayoutProps>) {
  return (
    <div className="[--container-page:var(--container-wide)]">
      <PageLayout top={brand}>
        <div className="relative py-6 sm:py-8">{children}</div>
      </PageLayout>
    </div>
  );
}
